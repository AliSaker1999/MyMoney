export const backupSql = {
  dumpSchemaMigrations: 'SELECT * FROM schema_migrations',
  dumpRateSources: 'SELECT * FROM rate_sources',
  dumpExchangeRates: 'SELECT * FROM exchange_rates',
  dumpAccounts: 'SELECT * FROM accounts',
  dumpCategories: 'SELECT * FROM categories',
  dumpTransactions: 'SELECT * FROM transactions',
  dumpEntries: 'SELECT * FROM entries',
  dumpBudgets: 'SELECT * FROM budgets',
  dumpGoals: 'SELECT * FROM goals',
  dumpGoalContributions: 'SELECT * FROM goal_contributions',
  dumpDebts: 'SELECT * FROM debts',
  dumpDebtMovements: 'SELECT * FROM debt_movements',
  dumpSettings: 'SELECT * FROM settings',
  accountBalances: `
    SELECT account_id, currency, balance_minor
    FROM v_account_balances
  `,
} as const;
