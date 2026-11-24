export const dashboardSql = {
  accountBalances: `
    SELECT a.id, a.name, a.currency, a.include_in_net_worth,
      CAST(COALESCE(b.balance_minor, '0') AS TEXT) AS balance_minor
    FROM accounts a
    LEFT JOIN v_account_balances b ON b.account_id = a.id
    WHERE a.archived_at IS NULL
    ORDER BY a.sort_order, a.name COLLATE NOCASE
  `,
  periodFlows: `
    SELECT kind,
      currency,
      CAST(COALESCE(SUM(usd_minor), 0) AS TEXT) AS usd_minor,
      CAST(COALESCE(SUM(lbp_minor), 0) AS TEXT) AS lbp_minor
    FROM v_categorized_flows
    WHERE date >= $fromDate AND date <= $toDate
    GROUP BY kind, currency
  `,
  accountLedger: `
    SELECT t.id, t.kind, t.date, t.lbp_per_usd_e4, t.rate_origin,
      t.rate_source_id, t.rate_source_label, t.rate_id, t.rate_date,
      t.payee, t.note, t.created_at, t.updated_at
    FROM transactions t
    JOIN entries e ON e.transaction_id = t.id
    WHERE e.account_id = $accountId
    ORDER BY t.date DESC, t.id DESC
  `,
  integrityCheck: 'PRAGMA integrity_check',
  foreignKeyCheck: 'PRAGMA foreign_key_check',
  ledgerViolations: `
    SELECT transaction_id, rule
    FROM v_ledger_violations
    ORDER BY transaction_id, rule
  `,
  recentTransactions: `
    SELECT t.id, t.kind, t.date, t.lbp_per_usd_e4, t.rate_origin,
      t.rate_source_id, t.rate_source_label, t.rate_id, t.rate_date,
      t.payee, t.note, t.created_at, t.updated_at
    FROM transactions t
    WHERE t.kind IN ('income','expense','refund','transfer')
    ORDER BY t.date DESC, t.id DESC
    LIMIT $limit
  `,
} as const;
