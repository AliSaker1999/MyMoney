/**
 * M0 compatibility-spike statements.
 *
 * All SQL lives in src/db/sql/ as named, parameterized statements (ARCHITECTURE.md, D1).
 * Values are always bound (`?` / `:name`), never interpolated.
 */
export const spikeSql = {
  sqliteVersion: 'SELECT sqlite_version() AS v',
  cipherVersion: 'PRAGMA cipher_version',
  schemaObjectCount: 'SELECT count(*) AS n FROM sqlite_master',
  /** Real-calendar-date check proposed in amendment 4: CHECK (date(col) IS col). */
  createDateProbe:
    'CREATE TABLE IF NOT EXISTS date_probe (id INTEGER PRIMARY KEY, d TEXT NOT NULL CHECK (date(d) IS d))',
  insertDateProbe: 'INSERT INTO date_probe (d) VALUES (?)',
} as const;

export type SpikeSqlName = keyof typeof spikeSql;
