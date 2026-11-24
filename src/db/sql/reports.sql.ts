export const reportsSql = {
  cashFlowByMonth: `
    SELECT substr(date,1,7) AS month,
      CAST(COALESCE(SUM(CASE WHEN kind='income' THEN usd_minor ELSE 0 END),0) AS TEXT) AS income_usd,
      CAST(COALESCE(SUM(CASE WHEN kind='refund' THEN usd_minor ELSE 0 END),0) AS TEXT) AS refund_usd,
      CAST(COALESCE(SUM(CASE WHEN kind='expense' THEN -usd_minor ELSE 0 END),0) AS TEXT) AS expense_usd,
      CAST(COALESCE(SUM(CASE WHEN kind='income' THEN lbp_minor ELSE 0 END),0) AS TEXT) AS income_lbp,
      CAST(COALESCE(SUM(CASE WHEN kind='refund' THEN lbp_minor ELSE 0 END),0) AS TEXT) AS refund_lbp,
      CAST(COALESCE(SUM(CASE WHEN kind='expense' THEN -lbp_minor ELSE 0 END),0) AS TEXT) AS expense_lbp
    FROM v_categorized_flows
    WHERE date >= $fromDate AND date <= $toDate
    GROUP BY substr(date,1,7)
    ORDER BY month
  `,
  categoryBreakdown: `
    SELECT category_id,
      COALESCE(c.name,c.builtin_key,'uncategorized') AS label,
      c.kind,
      CAST(COALESCE(SUM(usd_minor),0) AS TEXT) AS usd_minor,
      CAST(COALESCE(SUM(lbp_minor),0) AS TEXT) AS lbp_minor
    FROM v_categorized_flows f
    LEFT JOIN categories c ON c.id=f.category_id
    WHERE f.date >= $fromDate AND f.date <= $toDate
      AND f.kind IN ('income','expense','refund')
    GROUP BY category_id, label, c.kind
    ORDER BY ABS(SUM(usd_minor)) DESC
  `,
  netWorthNative: `
    SELECT b.currency, CAST(COALESCE(SUM(b.balance_minor),0) AS TEXT) AS balance_minor
    FROM v_account_balances b
    JOIN accounts a ON a.id=b.account_id
    WHERE a.archived_at IS NULL AND a.include_in_net_worth=1
    GROUP BY b.currency
  `,
  latestPreferredRate: `
    SELECT r.lbp_per_usd_e4, r.effective_date, r.source_id
    FROM exchange_rates r
    JOIN settings s ON s.key='preferred_rate_source_id' AND s.value=CAST(r.source_id AS TEXT)
    WHERE r.effective_date <= $date
    ORDER BY r.effective_date DESC, r.effective_seq DESC
    LIMIT 1
  `,
} as const;
