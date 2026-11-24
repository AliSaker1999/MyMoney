export type SqlValue = string | number | Uint8Array | null;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface DbRunResult {
  changes: number;
  lastInsertRowId: number | bigint;
}

export interface DbDriver {
  run(sql: string, params?: SqlParams): Promise<DbRunResult>;
  all<Row extends object>(sql: string, params?: SqlParams): Promise<Row[]>;
  get<Row extends object>(sql: string, params?: SqlParams): Promise<Row | null>;
  exec(sql: string): Promise<void>;
  exclusiveTransaction<Result>(work: (transaction: DbDriver) => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
}

export class SqlCipherUnavailableError extends Error {
  constructor() {
    super('SQLCipher is unavailable; refusing to open an unencrypted database.');
    this.name = 'SqlCipherUnavailableError';
  }
}

export class DatabaseUnlockError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super('The database could not be unlocked with the stored key.');
    this.name = 'DatabaseUnlockError';
    this.cause = cause;
  }
}
