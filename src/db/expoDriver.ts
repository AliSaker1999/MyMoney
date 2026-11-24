import * as SQLite from 'expo-sqlite';

import { AsyncMutex } from '@/db/asyncMutex';
import {
  DatabaseUnlockError,
  SqlCipherUnavailableError,
  type DbDriver,
  type DbRunResult,
  type SqlParams,
} from '@/db/driver';
import { connectionSql } from '@/db/sql/connection.sql';
import { keyPragma } from '@/db/sqlcipherKey';

export class ExpoSqliteDriver implements DbDriver {
  private constructor(
    private readonly database: SQLite.SQLiteDatabase,
    private readonly databaseName: string,
    private readonly key: Uint8Array,
    private readonly directory: string | undefined,
    private readonly mutex: AsyncMutex,
    private readonly transactionConnection: boolean,
  ) {}

  static async open(
    databaseName: string,
    key: Uint8Array,
    directory?: string,
  ): Promise<ExpoSqliteDriver> {
    const database = await SQLite.openDatabaseAsync(databaseName, undefined, directory);
    try {
      await initializeEncryptedConnection(database, key);
      return new ExpoSqliteDriver(
        database,
        databaseName,
        new Uint8Array(key),
        directory,
        new AsyncMutex(),
        false,
      );
    } catch (error) {
      try {
        await database.closeAsync();
      } catch (closeError) {
        throw new AggregateError([error, closeError], 'Database initialization and close failed.');
      }
      throw error;
    }
  }

  run(sql: string, params: SqlParams = []): Promise<DbRunResult> {
    return this.execute(() => this.database.runAsync(sql, params));
  }

  all<Row extends object>(sql: string, params: SqlParams = []): Promise<Row[]> {
    return this.execute(() => this.database.getAllAsync<Row>(sql, params));
  }

  get<Row extends object>(sql: string, params: SqlParams = []): Promise<Row | null> {
    return this.execute(() => this.database.getFirstAsync<Row>(sql, params));
  }

  exec(sql: string): Promise<void> {
    return this.execute(() => this.database.execAsync(sql));
  }

  async exclusiveTransaction<Result>(
    work: (transaction: DbDriver) => Promise<Result>,
  ): Promise<Result> {
    if (this.transactionConnection) {
      throw new Error('Nested database transactions are not supported.');
    }

    return this.mutex.runExclusive(async () => {
      const database = await SQLite.openDatabaseAsync(
        this.databaseName,
        { useNewConnection: true },
        this.directory,
      );
      let transactionStarted = false;

      try {
        await initializeEncryptedConnection(database, this.key);
        await database.execAsync(connectionSql.beginExclusive);
        transactionStarted = true;
        const transaction = new ExpoSqliteDriver(
          database,
          this.databaseName,
          this.key,
          this.directory,
          this.mutex,
          true,
        );
        const result = await work(transaction);
        await database.execAsync(connectionSql.commit);
        transactionStarted = false;
        return result;
      } catch (error) {
        if (transactionStarted) {
          try {
            await database.execAsync(connectionSql.rollback);
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Database transaction and rollback failed.');
          }
        }
        throw error;
      } finally {
        await database.closeAsync();
      }
    });
  }

  close(): Promise<void> {
    if (this.transactionConnection) {
      throw new Error('A transaction-scoped database connection cannot be closed directly.');
    }
    return this.mutex.runExclusive(() => this.database.closeAsync());
  }

  private execute<Result>(operation: () => Promise<Result>): Promise<Result> {
    return this.transactionConnection ? operation() : this.mutex.runExclusive(operation);
  }
}

async function initializeEncryptedConnection(
  database: SQLite.SQLiteDatabase,
  key: Uint8Array,
): Promise<void> {
  const cipher = await database.getFirstAsync<{ cipher_version: string }>(connectionSql.cipherVersion);
  if (!cipher?.cipher_version) {
    throw new SqlCipherUnavailableError();
  }

  await database.execAsync(keyPragma(key));
  try {
    await database.getFirstAsync<{ count: number }>(connectionSql.verifyKey);
  } catch (error) {
    throw new DatabaseUnlockError(error);
  }
  await database.execAsync(connectionSql.enableForeignKeys);
  const foreignKeys = await database.getFirstAsync<{ foreign_keys: number }>(connectionSql.foreignKeys);
  if (foreignKeys?.foreign_keys !== 1) {
    throw new Error('SQLite foreign-key enforcement could not be enabled.');
  }

  await database.execAsync(connectionSql.enableWal);
  const journal = await database.getFirstAsync<{ journal_mode: string }>(connectionSql.journalMode);
  if (journal?.journal_mode.toLowerCase() !== 'wal') {
    throw new Error('SQLite WAL journal mode could not be enabled.');
  }
}
