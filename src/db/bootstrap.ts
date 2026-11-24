import type { DbDriver } from '@/db/driver';
import {
  latestSchemaVersion,
  migrateDatabase,
  MigrationError,
  readDatabaseVersion,
} from '@/db/migrations';
import { recoverySql } from '@/db/sql/recovery.sql';
import { DatabaseUnlockError, SqlCipherUnavailableError } from '@/db/driver';
import {
  DatabaseKeyError,
  type DatabaseKeyLifecycle,
} from '@/security/databaseKey';

export type RecoverySource = 'safety' | 'quarantine' | 'replaced';

export interface RecoveryCandidate {
  id: string;
  name: string;
  source: RecoverySource;
  directory: string;
  modifiedAt: number | null;
}

export interface RecoveryCandidateInfo extends RecoveryCandidate {
  rowCounts: {
    accounts: number;
    categories: number;
    exchangeRates: number;
    entries: number;
    transactions: number;
  };
}

export interface RecoveryIssue {
  candidate: RecoveryCandidate;
  message: string;
}

export interface DatabaseRecoveryFiles {
  mainExists(): Promise<boolean>;
  quarantineMain(): Promise<void>;
  listCandidates(): Promise<RecoveryCandidate[]>;
  createSafetyCopy(database: DbDriver): Promise<void>;
  copyCandidateToMain(candidate: RecoveryCandidate): Promise<void>;
}

export interface DatabaseFactory {
  openMain(key: Uint8Array): Promise<DbDriver>;
  openCandidate(candidate: RecoveryCandidate, key: Uint8Array): Promise<DbDriver>;
}

export type DatabaseBootstrapState =
  | { status: 'ready'; database: DbDriver }
  | {
      status: 'recovery';
      reason: 'key-invalid' | 'key-missing' | 'main-unreadable' | 'main-missing';
      candidates: RecoveryCandidateInfo[];
      issues: RecoveryIssue[];
    };

export class DatabaseBootstrap {
  private state?: DatabaseBootstrapState;
  private initialization?: Promise<DatabaseBootstrapState>;
  private key?: Uint8Array;

  constructor(
    private readonly keys: DatabaseKeyLifecycle,
    private readonly files: DatabaseRecoveryFiles,
    private readonly factory: DatabaseFactory,
  ) {}

  initialize(): Promise<DatabaseBootstrapState> {
    if (this.state) return Promise.resolve(this.state);
    if (!this.initialization) {
      const initialization = this.runInitialization();
      this.initialization = initialization;
      void initialization.then(
        () => {
          if (this.initialization === initialization) this.initialization = undefined;
        },
        () => {
          if (this.initialization === initialization) this.initialization = undefined;
        },
      );
    }
    return this.initialization;
  }

  private async runInitialization(): Promise<DatabaseBootstrapState> {
    let storedKey: Uint8Array | null;
    try {
      storedKey = await this.keys.getExisting();
    } catch (error) {
      if (!(error instanceof DatabaseKeyError)) throw error;
      if (await this.files.mainExists()) await this.files.quarantineMain();
      return this.requireRecovery('key-invalid', []);
    }
    const mainExists = await this.files.mainExists();

    if (storedKey === null && mainExists) {
      await this.files.quarantineMain();
      return this.requireRecovery('key-missing', []);
    }

    this.key = storedKey ?? (await this.keys.getOrCreate());

    if (mainExists) {
      try {
        return await this.openAndMigrateMain();
      } catch (error) {
        if (error instanceof SqlCipherUnavailableError) throw error;
        if (!(error instanceof DatabaseUnlockError) && !(error instanceof MigrationError)) {
          throw error;
        }
        await this.files.quarantineMain();
        const { candidates, issues } = await this.inspectCandidates();
        return this.requireRecovery('main-unreadable', candidates, issues);
      }
    }

    if (storedKey) {
      const { candidates, issues } = await this.inspectCandidates();
      if (candidates.length > 0 || issues.length > 0) {
        return this.requireRecovery('main-missing', candidates, issues);
      }
    }

    return this.openAndMigrateMain();
  }

  async useCandidate(candidateId: string): Promise<DatabaseBootstrapState> {
    const state = this.state;
    const key = this.key;
    if (state?.status !== 'recovery' || !key) {
      throw new Error('Database recovery is not available.');
    }
    const candidate = state.candidates.find((item) => item.id === candidateId);
    if (!candidate) throw new Error('The selected recovery candidate is unavailable.');

    const database = await this.factory.openCandidate(candidate, key);
    try {
      const checkpoint = await database.get<{
        busy: number;
        log: number;
        checkpointed: number;
      }>(recoverySql.walCheckpoint);
      if (checkpoint && checkpoint.busy !== 0) {
        throw new Error('The recovery database could not be safely checkpointed.');
      }
    } finally {
      await database.close();
    }

    await this.files.copyCandidateToMain(candidate);
    this.state = undefined;
    try {
      return await this.openAndMigrateMain();
    } catch (error) {
      if (!(error instanceof DatabaseUnlockError) && !(error instanceof MigrationError)) {
        throw error;
      }
      await this.files.quarantineMain();
      const { candidates, issues } = await this.inspectCandidates();
      return this.requireRecovery('main-unreadable', candidates, issues);
    }
  }

  async startFresh(): Promise<DatabaseBootstrapState> {
    if (this.state?.status !== 'recovery' || this.state.reason !== 'main-missing') {
      throw new Error('Starting fresh is available only when the main database is missing.');
    }
    this.state = undefined;
    return this.openAndMigrateMain();
  }

  async reset(confirmation: string): Promise<DatabaseBootstrapState> {
    const state = this.state;
    if (state?.status !== 'recovery') {
      throw new Error('Database reset is available only from the recovery screen.');
    }
    this.key = await this.keys.reset(confirmation);
    this.state = undefined;
    return this.openAndMigrateMain();
  }

  private async openAndMigrateMain(): Promise<DatabaseBootstrapState> {
    const key = this.key;
    if (!key) throw new DatabaseKeyError('A database key is not available.');
    const database = await this.factory.openMain(key);
    try {
      const version = await readDatabaseVersion(database);
      if (version > 0 && version < latestSchemaVersion) {
        await this.files.createSafetyCopy(database);
      }
      await migrateDatabase(database);
    } catch (error) {
      try {
        await database.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], 'Database bootstrap and close failed.');
      }
      throw error;
    }
    this.state = { status: 'ready', database };
    return this.state;
  }

  private async inspectCandidates(): Promise<{
    candidates: RecoveryCandidateInfo[];
    issues: RecoveryIssue[];
  }> {
    const key = this.key;
    if (!key) throw new DatabaseKeyError('A database key is not available for recovery.');
    const files = await this.files.listCandidates();
    const candidates: RecoveryCandidateInfo[] = [];
    const issues: RecoveryIssue[] = [];

    for (const candidate of files) {
      let database: DbDriver | undefined;
      try {
        database = await this.factory.openCandidate(candidate, key);
        const version = await readDatabaseVersion(database);
        if (version > latestSchemaVersion) {
          throw new MigrationError(`Database version ${version} is newer than this app supports.`);
        }
        const rowCounts = await database.get<RecoveryCandidateInfo['rowCounts']>(
          recoverySql.rowCounts,
        );
        if (!rowCounts) throw new Error('The recovery database did not return row counts.');
        candidates.push({ ...candidate, rowCounts });
      } catch (error) {
        if (
          !(error instanceof DatabaseUnlockError) &&
          !(error instanceof MigrationError) &&
          !(error instanceof Error)
        ) {
          throw error;
        }
        issues.push({ candidate, message: errorMessage(error) });
      } finally {
        if (database) await database.close();
      }
    }
    return { candidates, issues };
  }

  private requireRecovery(
    reason: Extract<DatabaseBootstrapState, { status: 'recovery' }>['reason'],
    candidates: RecoveryCandidateInfo[],
    issues: RecoveryIssue[] = [],
  ): DatabaseBootstrapState {
    this.state = { status: 'recovery', reason, candidates, issues };
    return this.state;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Recovery candidate could not be read.';
}
