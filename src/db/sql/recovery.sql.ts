export const recoverySql = {
  rowCounts: `
    SELECT
      (SELECT count(*) FROM accounts) AS accounts,
      (SELECT count(*) FROM categories) AS categories,
      (SELECT count(*) FROM exchange_rates) AS exchange_rates,
      (SELECT count(*) FROM entries) AS entries,
      (SELECT count(*) FROM transactions) AS transactions
  `,
  walCheckpoint: 'PRAGMA wal_checkpoint(FULL)',
} as const;
