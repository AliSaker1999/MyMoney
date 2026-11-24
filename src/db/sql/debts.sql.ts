export const debtsSql = {
  listDebts: `
    SELECT
      d.id, d.counterparty, d.direction, d.currency,
      d.start_date, d.due_date,
      COALESCE(CAST(SUM(dm.amount_minor) AS TEXT), '0') AS outstanding_minor,
      d.settled_at, d.created_at, d.updated_at
    FROM debts d
    LEFT JOIN debt_movements dm ON dm.debt_id = d.id
    GROUP BY d.id
    ORDER BY d.settled_at IS NULL DESC, d.created_at DESC
  `,
  getDebt: `
    SELECT
      d.id, d.counterparty, d.direction, d.currency,
      d.start_date, d.due_date,
      COALESCE(CAST(SUM(dm.amount_minor) AS TEXT), '0') AS outstanding_minor,
      d.settled_at, d.created_at, d.updated_at
    FROM debts d
    LEFT JOIN debt_movements dm ON dm.debt_id = d.id
    WHERE d.id = $id
    GROUP BY d.id
  `,
  getDebtMovements: `
    SELECT
      id, debt_id, transaction_id, date,
      CAST(amount_minor AS TEXT) AS amount_minor, created_at
    FROM debt_movements
    WHERE debt_id = $debtId
    ORDER BY date DESC
  `,
  insertDebt: `
    INSERT INTO debts (
      counterparty, direction, currency, start_date, due_date, note, created_at, updated_at
    ) VALUES (
      $counterparty, $direction, $currency, $startDate, $dueDate, $note, $createdAt, $updatedAt
    )
  `,
  updateDebt: `
    UPDATE debts
    SET counterparty = $counterparty, due_date = $dueDate, note = $note, updated_at = $updatedAt
    WHERE id = $id
  `,
  deleteDebt: `
    DELETE FROM debts WHERE id = $id
  `,
  insertDebtMovement: `
    INSERT INTO debt_movements (
      debt_id, transaction_id, date, amount_minor, created_at
    ) VALUES (
      $debtId, $transactionId, $date, $amountMinor, $createdAt
    )
  `,
  deleteDebtMovement: `
    DELETE FROM debt_movements WHERE id = $id
  `,
  settleDebt: `
    UPDATE debts
    SET settled_at = $settledAt, updated_at = $updatedAt
    WHERE id = $id
  `,
  reopenDebt: `
    UPDATE debts
    SET settled_at = NULL, updated_at = $updatedAt
    WHERE id = $id
  `,
} as const;
