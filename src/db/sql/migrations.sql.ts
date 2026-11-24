export const migrationSql = {
  userVersion: 'PRAGMA user_version',
  list: 'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
  insert: `
    INSERT INTO schema_migrations (version, name, checksum, applied_at)
    VALUES ($version, $name, $checksum, $appliedAt)
  `,
} as const;
