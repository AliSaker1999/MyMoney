export const ledgerSetupSql = {
  getAccount: `
    SELECT id, name, type, currency, archived_at
    FROM accounts WHERE id = $id
  `,
  openingBalanceCount: `
    SELECT count(*) AS count
    FROM entries e
    JOIN transactions t ON t.id = e.transaction_id
    WHERE e.account_id = $accountId AND t.kind = 'opening_balance'
  `,
  insertOpeningTransaction: `
    INSERT INTO transactions (
      kind, date, lbp_per_usd_e4, rate_origin, rate_source_id,
      rate_source_label, rate_id, rate_date, created_at, updated_at
    ) VALUES (
      'opening_balance', $date, $rateE4, $rateOrigin, $rateSourceId,
      $rateSourceLabel, $rateId, $rateDate, $timestamp, $timestamp
    )
  `,
  insertOpeningEntry: `
    INSERT INTO entries (
      transaction_id, account_id, category_id, currency,
      amount_minor, usd_minor, lbp_minor, memo
    ) VALUES (
      $transactionId, $accountId, NULL, $currency,
      $amountMinor, $usdMinor, $lbpMinor, $memo
    )
  `,
  getOpeningEntry: `
    SELECT t.id AS transaction_id, t.date, t.lbp_per_usd_e4,
      t.rate_origin, t.rate_source_id, t.rate_source_label,
      e.id AS entry_id, e.currency, e.amount_minor, e.usd_minor, e.lbp_minor, e.memo
    FROM transactions t
    JOIN entries e ON e.transaction_id = t.id
    WHERE t.kind = 'opening_balance' AND e.account_id = $accountId
  `,
  updateOpeningTransaction: `
    UPDATE transactions
    SET date = $date, lbp_per_usd_e4 = $rateE4,
      rate_origin = $rateOrigin, rate_source_id = $rateSourceId,
      rate_source_label = $rateSourceLabel, rate_id = $rateId,
      rate_date = $rateDate, updated_at = $timestamp
    WHERE id = $transactionId AND kind = 'opening_balance'
  `,
  updateOpeningEntry: `
    UPDATE entries
    SET amount_minor = $amountMinor, usd_minor = $usdMinor,
      lbp_minor = $lbpMinor, memo = $memo
    WHERE transaction_id = $transactionId AND account_id = $accountId
  `,
} as const;
