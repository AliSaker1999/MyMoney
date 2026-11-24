import type Database from 'better-sqlite3';

import { AsyncMutex } from '@/db/asyncMutex';
import type { DbDriver, DbRunResult, SqlParams, SqlValue } from '@/db/driver';
import { connectionSql } from '@/db/sql/connection.sql';

export class BetterSqliteDriver implements DbDriver {
  private constructor(
    private readonly database: Database.Database,
    private readonly mutex: AsyncMutex,
    private readonly transactionConnection: boolean,
  ) {}

  static open(database: Database.Database): BetterSqliteDriver {
    database.pragma('foreign_keys = ON');
    const foreignKeys = database.pragma('foreign_keys', { simple: true });
    if (foreignKeys !== 1) {
      throw new Error('SQLite foreign-key enforcement could not be enabled.');
    }
    if (!database.memory) {
      database.pragma('journal_mode = WAL');
      const journalMode = database.pragma('journal_mode', { simple: true });
      if (journalMode !== 'wal') {
        throw new Error('SQLite WAL journal mode could not be enabled.');
      }
    }
    return new BetterSqliteDriver(database, new AsyncMutex(), false);
  }

  run(sql: string, params: SqlParams = []): Promise<DbRunResult> {
    return this.execute(() => {
      const statement = this.database.prepare<unknown[], unknown>(sql);
      const result = Array.isArray(params)
        ? statement.run(...params)
        : statement.run(normalizeNamedParams(params));
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    });
  }

  all<Row extends object>(sql: string, params: SqlParams = []): Promise<Row[]> {
    return this.execute(() => {
      const statement = this.database.prepare<unknown[], Row>(sql);
      return Array.isArray(params)
        ? statement.all(...params)
        : statement.all(normalizeNamedParams(params));
    });
  }

  get<Row extends object>(sql: string, params: SqlParams = []): Promise<Row | null> {
    return this.execute(() => {
      const statement = this.database.prepare<unknown[], Row>(sql);
      const row = Array.isArray(params)
        ? statement.get(...params)
        : statement.get(normalizeNamedParams(params));
      return row === undefined ? null : row;
    });
  }

  exec(sql: string): Promise<void> {
    return this.execute(() => {
      this.database.exec(sql);
    });
  }

  async exclusiveTransaction<Result>(
    work: (transaction: DbDriver) => Promise<Result>,
  ): Promise<Result> {
    if (this.transactionConnection) {
      throw new Error('Nested database transactions are not supported.');
    }

    return this.mutex.runExclusive(async () => {
      this.database.exec(connectionSql.beginExclusive);
      try {
        const transaction = new BetterSqliteDriver(this.database, this.mutex, true);
        const result = await work(transaction);
        this.database.exec(connectionSql.commit);
        return result;
      } catch (error) {
        try {
          this.database.exec(connectionSql.rollback);
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], 'Database transaction and rollback failed.');
        }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    if (this.transactionConnection) {
      throw new Error('A transaction-scoped database connection cannot be closed directly.');
    }
    return this.mutex.runExclusive(async () => {
      this.database.close();
    });
  }

  private execute<Result>(operation: () => Result): Promise<Result> {
    const execute = async () => operation();
    return this.transactionConnection ? execute() : this.mutex.runExclusive(execute);
  }
}

function normalizeNamedParams(params: Record<string, SqlValue>): Record<string, SqlValue> {
  const normalized: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key.replace(/^[$:@]/, '')] = value;
  }
  return normalized;
}
