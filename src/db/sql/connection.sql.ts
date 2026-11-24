export const connectionSql = {
  cipherVersion: 'PRAGMA cipher_version',
  verifyKey: 'SELECT count(*) AS count FROM sqlite_master',
  enableForeignKeys: 'PRAGMA foreign_keys = ON',
  foreignKeys: 'PRAGMA foreign_keys',
  enableWal: 'PRAGMA journal_mode = WAL',
  journalMode: 'PRAGMA journal_mode',
  beginExclusive: 'BEGIN EXCLUSIVE',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
} as const;
