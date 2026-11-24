export const ledgerSql = {
  listTransferFees: `
    SELECT child.id
    FROM transactions child
    WHERE child.parent_transaction_id = $transferId
      AND child.link_type = 'transfer_fee'
  `,
  insertLinkedFee: `
    INSERT INTO transactions (
      kind, date, lbp_per_usd_e4, rate_origin, parent_transaction_id, link_type,
      payee, note, created_at, updated_at
    ) VALUES (
      'expense', $date, $rateE4, 'inherited', $parentId, 'transfer_fee',
      $payee, $note, $createdAt, $updatedAt
    )
  `,
  getAccount: `
    SELECT id, name, currency, archived_at
    FROM accounts WHERE id = $id
  `,
  getCategory: `
    SELECT id, name, kind, archived_at
    FROM categories WHERE id = $id
  `,
  insertTransaction: `
    INSERT INTO transactions (
      kind, date, lbp_per_usd_e4, rate_origin, rate_source_id,
      rate_source_label, rate_id, rate_date, payee, note, created_at, updated_at
    ) VALUES (
      $kind, $date, $rateE4, $rateOrigin, $rateSourceId,
      $rateSourceLabel, $rateId, $rateDate, $payee, $note, $createdAt, $updatedAt
    )
  `,
  insertEntry: `
    INSERT INTO entries (
      transaction_id, account_id, category_id, currency,
      amount_minor, usd_minor, lbp_minor, memo
    ) VALUES (
      $transactionId, $accountId, $categoryId, $currency,
      $amountMinor, $usdMinor, $lbpMinor, $memo
    )
  `,
  updateTransaction: `
    UPDATE transactions
    SET date = $date, lbp_per_usd_e4 = $rateE4,
      rate_origin = $rateOrigin, rate_source_id = $rateSourceId,
      rate_source_label = $rateSourceLabel, rate_id = $rateId,
      rate_date = $rateDate, payee = $payee, note = $note, updated_at = $updatedAt
    WHERE id = $id
  `,
  deleteEntries: 'DELETE FROM entries WHERE transaction_id = $transactionId',
  deleteTransaction: 'DELETE FROM transactions WHERE id = $id',
  getTransaction: `
    SELECT t.id, t.kind, t.date, t.lbp_per_usd_e4, t.rate_origin,
      t.rate_source_id, t.rate_source_label, t.rate_id, t.rate_date,
      t.payee, t.note, t.created_at, t.updated_at
    FROM transactions t WHERE t.id = $id
  `,
  listEntries: `
    SELECT e.id, e.transaction_id, e.account_id, e.category_id,
      e.currency, CAST(e.amount_minor AS TEXT) AS amount_minor,
      CAST(e.usd_minor AS TEXT) AS usd_minor,
      CAST(e.lbp_minor AS TEXT) AS lbp_minor, e.memo,
      a.name AS account_name, c.name AS category_name, c.builtin_key AS category_builtin_key
    FROM entries e
    JOIN accounts a ON a.id = e.account_id
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.transaction_id = $transactionId
  `,
  listTransactions: `
    SELECT t.id, t.kind, t.date, t.lbp_per_usd_e4, t.rate_origin,
      t.rate_source_id, t.rate_source_label, t.rate_id, t.rate_date,
      t.payee, t.note, t.created_at, t.updated_at
    FROM transactions t
    WHERE t.kind IN ('income','expense','refund','transfer')
    ORDER BY t.date DESC, t.id DESC
  `,
  violationsForTransaction: `
    SELECT rule FROM v_ledger_violations
    WHERE transaction_id = $transactionId
  `,
} as const;
