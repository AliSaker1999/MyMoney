export const budgetsSql = {
  listBudgets: `
    SELECT
      b.id, b.category_id, c.name AS category_name, c.builtin_key AS category_builtin_key,
      b.currency, CAST(b.amount_minor AS TEXT) AS amount_minor,
      b.start_month, b.end_month, b.created_at, b.updated_at
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
    ORDER BY b.start_month DESC, COALESCE(c.name, c.builtin_key) COLLATE NOCASE, b.id
  `,
  getBudget: `
    SELECT
      b.id, b.category_id, c.name AS category_name, c.builtin_key AS category_builtin_key,
      b.currency, CAST(b.amount_minor AS TEXT) AS amount_minor,
      b.start_month, b.end_month, b.created_at, b.updated_at
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
    WHERE b.id = $id
  `,
  findBudgetOverlap: `
    SELECT id FROM budgets
    WHERE category_id = $categoryId
      AND currency = $currency
      AND start_month <= COALESCE($endMonth, start_month)
      AND COALESCE(end_month, start_month) >= $startMonth
      AND id <> COALESCE($excludeBudgetId, -1)
  `,
  insertBudget: `
    INSERT INTO budgets (
      category_id, currency, amount_minor, start_month, end_month, created_at, updated_at
    ) VALUES (
      $categoryId, $currency, $amountMinor, $startMonth, $endMonth, $createdAt, $updatedAt
    )
  `,
  updateBudget: `
    UPDATE budgets
    SET amount_minor = $amountMinor, end_month = $endMonth, updated_at = $updatedAt
    WHERE id = $id
  `,
  deleteBudget: `
    DELETE FROM budgets WHERE id = $id
  `,
  budgetExpensesByMonth: `
    SELECT
      CAST(COALESCE(SUM(CASE WHEN currency = 'USD' THEN -amount_minor ELSE 0 END), 0) AS TEXT) AS spent_usd_minor,
      CAST(COALESCE(SUM(CASE WHEN currency = 'LBP' THEN -amount_minor ELSE 0 END), 0) AS TEXT) AS spent_lbp_minor
    FROM v_categorized_flows
    WHERE category_id = $categoryId
      AND kind IN ('expense', 'refund')
      AND substr(date, 1, 7) = $month
  `,
  budgetsByMonth: `
    SELECT
      b.id, b.category_id, c.name AS category_name, c.builtin_key AS category_builtin_key,
      b.currency, CAST(b.amount_minor AS TEXT) AS amount_minor,
      b.start_month, b.end_month, b.created_at, b.updated_at
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
    WHERE b.start_month <= $month
      AND (b.end_month IS NULL OR b.end_month >= $month)
    ORDER BY b.start_month DESC, COALESCE(c.name, c.builtin_key) COLLATE NOCASE, b.id
  `,
} as const;
