export const onboardingSql = {
  getSetupComplete: `SELECT value FROM settings WHERE key = 'onboarding_complete'`,
  getPreferredRateSourceId: `SELECT value FROM settings WHERE key = 'preferred_rate_source_id'`,
  getRateSource: 'SELECT id FROM rate_sources WHERE code = $code',
  insertRateSource: `
    INSERT INTO rate_sources (code, is_builtin, created_at)
    VALUES ($code, 1, $createdAt)
    ON CONFLICT(code) DO NOTHING
  `,
  insertExchangeRate: `
    INSERT INTO exchange_rates (
      source_id, effective_date, effective_seq, lbp_per_usd_e4, note, created_at
    ) VALUES ($sourceId, $effectiveDate, 0, $rateE4, NULL, $createdAt)
  `,
  insertAccount: `
    INSERT INTO accounts (
      name, type, currency, include_in_net_worth, sort_order, created_at, updated_at
    ) VALUES ($name, $type, $currency, 1, 0, $createdAt, $updatedAt)
  `,
  insertCategory: `
    INSERT INTO categories (
      builtin_key, kind, sort_order, created_at, updated_at
    ) VALUES ($builtinKey, $kind, $sortOrder, $createdAt, $updatedAt)
    ON CONFLICT(builtin_key) DO NOTHING
  `,
  setSetting: `
    INSERT INTO settings (key, value) VALUES ($key, $value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
} as const;
