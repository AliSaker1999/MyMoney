import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { DbDriver } from '@/db/driver';
import { initialMigration } from '@/db/migrations/0001_init';
import type { Migration } from '@/db/migrations/types';
import { migrationSql } from '@/db/sql/migrations.sql';

const migrations: readonly Migration[] = [initialMigration];
export const latestSchemaVersion = migrations.length;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

interface UserVersionRow {
  user_version: number;
}

interface MigrationRecord {
  version: number;
  name: string;
  checksum: string;
}

export async function migrateDatabase(
  database: DbDriver,
  appliedAt: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateMigrationCatalog(migrations);
  let version = await getUserVersion(database);

  if (version > migrations.length) {
    throw new MigrationError(`Database version ${version} is newer than this app supports.`);
  }

  if (version > 0) {
    await verifyAppliedMigrations(database, version);
  }

  while (version < migrations.length) {
    const migration = migrations[version];
    if (!migration || migration.version !== version + 1) {
      throw new MigrationError(`Missing migration ${version + 1}.`);
    }

    const checksum = checksumMigration(migration);
    await database.exclusiveTransaction(async (transaction) => {
      const observedVersion = await getUserVersion(transaction);
      if (observedVersion !== version) {
        throw new MigrationError('Database version changed while migrations were being applied.');
      }

      for (const statement of migration.statements) {
        await transaction.exec(statement);
      }
      await transaction.run(migrationSql.insert, {
        $version: migration.version,
        $name: migration.name,
        $checksum: checksum,
        $appliedAt: appliedAt(),
      });
    });

    version = await getUserVersion(database);
    if (version !== migration.version) {
      throw new MigrationError(`Migration ${migration.version} did not update user_version.`);
    }
  }
}

async function getUserVersion(database: DbDriver): Promise<number> {
  const row = await database.get<UserVersionRow>(migrationSql.userVersion);
  if (!row || !Number.isSafeInteger(row.user_version) || row.user_version < 0) {
    throw new MigrationError('SQLite returned an invalid user_version.');
  }
  return row.user_version;
}

export function readDatabaseVersion(database: DbDriver): Promise<number> {
  return getUserVersion(database);
}

async function verifyAppliedMigrations(database: DbDriver, currentVersion: number): Promise<void> {
  let records: MigrationRecord[];
  try {
    records = await database.all<MigrationRecord>(migrationSql.list);
  } catch (error) {
    throw new MigrationError(`Migration history is unavailable: ${describeError(error)}`);
  }

  for (let version = 1; version <= currentVersion; version++) {
    const migration = migrations[version - 1];
    const record = records.find((item) => item.version === version);
    if (!migration || !record) {
      throw new MigrationError(`Migration history is missing version ${version}.`);
    }
    if (record.name !== migration.name || record.checksum !== checksumMigration(migration)) {
      throw new MigrationError(`Applied migration ${version} has changed or is corrupted.`);
    }
  }
  if (records.some((record) => record.version > currentVersion)) {
    throw new MigrationError('Migration history contains a version newer than user_version.');
  }
}

function validateMigrationCatalog(catalog: readonly Migration[]): void {
  const versions = new Set<number>();
  for (const migration of catalog) {
    if (
      !Number.isSafeInteger(migration.version) ||
      migration.version < 1 ||
      versions.has(migration.version) ||
      migration.statements.length === 0
    ) {
      throw new MigrationError('Migration catalog has invalid versions or empty migrations.');
    }
    versions.add(migration.version);
  }
  for (let version = 1; version <= catalog.length; version++) {
    if (!versions.has(version)) throw new MigrationError(`Migration catalog is missing version ${version}.`);
  }
}

function checksumMigration(migration: Migration): string {
  const payload = `${migration.version}\n${migration.name}\n${migration.statements.join('\n')}`;
  return bytesToHex(sha256(new TextEncoder().encode(payload)));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown database error';
}
