import { Directory, File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import type { DatabaseFactory, DatabaseRecoveryFiles, RecoveryCandidate } from '@/db/bootstrap';
import type { DbDriver } from '@/db/driver';
import { ExpoSqliteDriver } from '@/db/expoDriver';
import { recoverySql } from '@/db/sql/recovery.sql';

export const DATABASE_NAME = 'mymoney.db';

export class ExpoDatabaseRecoveryFiles implements DatabaseRecoveryFiles {
  private readonly sqliteDirectory: string;
  private readonly sqliteDirectoryUri: string;

  constructor() {
    const directory: unknown = SQLite.defaultDatabaseDirectory;
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new Error('Expo SQLite did not provide its database directory.');
    }
    this.sqliteDirectory = directory;
    this.sqliteDirectoryUri = asFileUri(directory);
  }

  async mainExists(): Promise<boolean> {
    return this.mainFile().exists;
  }

  async quarantineMain(): Promise<void> {
    const main = this.mainFile();
    if (!main.exists) return;

    const quarantineDirectory = this.subdirectory('quarantine');
    quarantineDirectory.create({ idempotent: true, intermediates: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destinationName = `mymoney-${timestamp}.db`;
    await main.move(new File(quarantineDirectory, destinationName));

    for (const suffix of ['-wal', '-shm']) {
      const sidecar = this.mainFile(`${DATABASE_NAME}${suffix}`);
      if (sidecar.exists) {
        await sidecar.move(new File(quarantineDirectory, `${destinationName}${suffix}`));
      }
    }
  }

  async listCandidates(): Promise<RecoveryCandidate[]> {
    const candidates: RecoveryCandidate[] = [];
    for (const source of ['safety', 'quarantine'] as const) {
      const directory = this.subdirectory(source);
      if (!directory.exists) continue;
      for (const item of directory.list()) {
        if (!(item instanceof File) || item.extension.toLowerCase() !== '.db') continue;
        const info = item.info();
        candidates.push({
          id: `${source}:${item.uri}`,
          name: item.name,
          source,
          directory: appendPath(this.sqliteDirectory, source),
          modifiedAt: info.modificationTime ?? null,
        });
      }
    }

    const root = new Directory(this.sqliteDirectoryUri);
    if (root.exists) {
      for (const item of root.list()) {
        if (
          !(item instanceof File) ||
          item.extension.toLowerCase() !== '.db' ||
          !item.name.startsWith('replaced-')
        ) {
          continue;
        }
        candidates.push({
          id: `replaced:${item.uri}`,
          name: item.name,
          source: 'replaced',
          directory: this.sqliteDirectory,
          modifiedAt: item.info().modificationTime ?? null,
        });
      }
    }

    return candidates.sort((left, right) => (right.modifiedAt ?? 0) - (left.modifiedAt ?? 0));
  }

  async createSafetyCopy(database: DbDriver): Promise<void> {
    const checkpoint = await database.get<{
      busy: number;
      log: number;
      checkpointed: number;
    }>(recoverySql.walCheckpoint);
    if (!checkpoint || checkpoint.busy !== 0) {
      throw new Error('The database could not be checkpointed before migration.');
    }

    const safetyDirectory = this.subdirectory('safety');
    safetyDirectory.create({ idempotent: true, intermediates: true });
    const backupName = `migration-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    await this.mainFile().copy(new File(safetyDirectory, backupName));

    const wal = this.mainFile(`${DATABASE_NAME}-wal`);
    if (wal.exists) await wal.copy(new File(safetyDirectory, `${backupName}-wal`));
    await this.retainRecentSafetyCopies(safetyDirectory);
  }

  async copyCandidateToMain(candidate: RecoveryCandidate): Promise<void> {
    const main = this.mainFile();
    const wal = this.mainFile(`${DATABASE_NAME}-wal`);
    const shm = this.mainFile(`${DATABASE_NAME}-shm`);
    if (main.exists || wal.exists || shm.exists) {
      throw new Error('The main database path is not empty; refusing to replace it.');
    }

    await new File(asFileUri(candidate.directory), candidate.name).copy(main);
  }

  private mainFile(name = DATABASE_NAME): File {
    return new File(this.sqliteDirectoryUri, name);
  }

  private subdirectory(name: string): Directory {
    return new Directory(this.sqliteDirectoryUri, name);
  }

  private async retainRecentSafetyCopies(directory: Directory): Promise<void> {
    const files = directory
      .list()
      .filter((item): item is File => item instanceof File && item.extension === '.db')
      .sort((left, right) => (right.info().modificationTime ?? 0) - (left.info().modificationTime ?? 0));

    for (const file of files.slice(3)) {
      file.delete();
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = new File(directory, `${file.name}${suffix}`);
        if (sidecar.exists) sidecar.delete();
      }
    }
  }
}

export class ExpoDatabaseFactory implements DatabaseFactory {
  openMain(key: Uint8Array): Promise<DbDriver> {
    return ExpoSqliteDriver.open(DATABASE_NAME, key);
  }

  openCandidate(candidate: RecoveryCandidate, key: Uint8Array): Promise<DbDriver> {
    return ExpoSqliteDriver.open(candidate.name, key, candidate.directory);
  }
}

function asFileUri(path: string): string {
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

function appendPath(directory: string, child: string): string {
  return `${directory.replace(/[\\/]+$/, '')}/${child}`;
}
