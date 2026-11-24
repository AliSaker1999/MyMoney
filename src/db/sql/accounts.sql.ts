export const accountsSql = {
  listAccounts: `
    SELECT a.id, a.name, a.type, a.currency, a.include_in_net_worth,
      a.sort_order, a.archived_at, a.created_at, a.updated_at,
      CAST(COALESCE(b.balance_minor, '0') AS TEXT) AS balance_minor
    FROM accounts a
    LEFT JOIN v_account_balances b ON b.account_id = a.id
    ORDER BY a.archived_at IS NOT NULL, a.sort_order, a.name COLLATE NOCASE
  `,
  getAccount: `
    SELECT id, name, type, currency, include_in_net_worth, sort_order, archived_at
    FROM accounts WHERE id = $id
  `,
  findAccountByName: `
    SELECT id FROM accounts
    WHERE name = $name COLLATE NOCASE AND archived_at IS NULL
  `,
  insertAccount: `
    INSERT INTO accounts (
      name, type, currency, include_in_net_worth, sort_order, created_at, updated_at
    ) VALUES (
      $name, $type, $currency, $includeInNetWorth, $sortOrder, $createdAt, $updatedAt
    )
  `,
  updateAccount: `
    UPDATE accounts
    SET name = $name, type = $type, include_in_net_worth = $includeInNetWorth,
      sort_order = $sortOrder, updated_at = $updatedAt
    WHERE id = $id AND archived_at IS NULL
  `,
  archiveAccount: `
    UPDATE accounts
    SET archived_at = $archivedAt, updated_at = $archivedAt
    WHERE id = $id AND archived_at IS NULL
  `,
  entryCount: 'SELECT count(*) AS count FROM entries WHERE account_id = $id',
} as const;
