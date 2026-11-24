export const testFixtureSql = {
  insertRateSource: `
    INSERT INTO rate_sources (code, is_builtin, created_at)
    VALUES ($code, $isBuiltin, $createdAt)
  `,
  insertExchangeRate: `
    INSERT INTO exchange_rates (
      source_id, effective_date, effective_seq, lbp_per_usd_e4, created_at
    ) VALUES ($sourceId, $effectiveDate, $effectiveSeq, $rate, $createdAt)
  `,
  insertAccount: `
    INSERT INTO accounts (
      name, type, currency, created_at, updated_at
    ) VALUES ($name, $type, $currency, $createdAt, $updatedAt)
  `,
  insertCategory: `
    INSERT INTO categories (
      name, kind, created_at, updated_at
    ) VALUES ($name, $kind, $createdAt, $updatedAt)
  `,
  insertTransaction: `
    INSERT INTO transactions (
      kind, date, lbp_per_usd_e4, rate_origin, created_at, updated_at
    ) VALUES ($kind, $date, $rate, $rateOrigin, $createdAt, $updatedAt)
  `,
  insertLinkedTransaction: `
    INSERT INTO transactions (
      kind, date, lbp_per_usd_e4, rate_origin, parent_transaction_id, link_type,
      created_at, updated_at
    ) VALUES (
      $kind, $date, $rate, $rateOrigin, $parentId, $linkType, $createdAt, $updatedAt
    )
  `,
  insertDebt: `
    INSERT INTO debts (counterparty, direction, currency, start_date, created_at, updated_at)
    VALUES ($counterparty, $direction, $currency, $date, $createdAt, $updatedAt)
  `,
  insertDebtMovement: `
    INSERT INTO debt_movements (debt_id, transaction_id, date, amount_minor, created_at)
    VALUES ($debtId, $transactionId, $date, $amountMinor, $createdAt)
  `,
  insertEntry: `
    INSERT INTO entries (
      transaction_id, account_id, category_id, currency, amount_minor, usd_minor, lbp_minor
    ) VALUES (
      $transactionId, $accountId, $categoryId, $currency, $amountMinor, $usdMinor, $lbpMinor
    )
  `,
  updateEntryAmounts: `
    UPDATE entries
    SET amount_minor = $amountMinor, usd_minor = $usdMinor, lbp_minor = $lbpMinor
    WHERE transaction_id = $transactionId
  `,
  deleteTransaction: 'DELETE FROM transactions WHERE id = $id',
  updateAccountCurrency: 'UPDATE accounts SET currency = $currency WHERE id = $id',
  updateTransactionKind: 'UPDATE transactions SET kind = $kind WHERE id = $id',
  balanceForAccount: `
    SELECT balance_minor FROM v_account_balances WHERE account_id = $accountId
  `,
  flowCount: 'SELECT count(*) AS count FROM v_categorized_flows WHERE transaction_id = $transactionId',
  violationsForTransaction: `
    SELECT rule FROM v_ledger_violations WHERE transaction_id = $transactionId ORDER BY rule
  `,
  allLedgerViolations: `
    SELECT transaction_id, rule FROM v_ledger_violations ORDER BY transaction_id, rule
  `,
  migrationCount: 'SELECT count(*) AS count FROM schema_migrations',
  rateSourceCount: 'SELECT count(*) AS count FROM rate_sources',
  debtOutstanding: `
    SELECT outstanding_minor FROM v_debt_outstanding WHERE debt_id = $debtId
  `,
  databaseObjects: `
    SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name
  `,
  setFutureUserVersion: 'PRAGMA user_version = 99',
  changeMigrationChecksum: `
    UPDATE schema_migrations SET checksum = $checksum WHERE version = $version
  `,
} as const;
