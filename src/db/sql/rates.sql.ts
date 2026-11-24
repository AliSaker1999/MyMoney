export const ratesSql = {
  listSources: `
    SELECT id, code, name, is_builtin, archived_at
    FROM rate_sources
    ORDER BY is_builtin DESC, COALESCE(name, code) COLLATE NOCASE, id
  `,
  getSource: `
    SELECT id, code, name, is_builtin, archived_at
    FROM rate_sources WHERE id = $id
  `,
  findSourceByName: `
    SELECT id FROM rate_sources
    WHERE name = $name COLLATE NOCASE AND archived_at IS NULL
  `,
  insertCustomSource: `
    INSERT INTO rate_sources (code, name, is_builtin, created_at)
    VALUES (NULL, $name, 0, $createdAt)
  `,
  renameCustomSource: `
    UPDATE rate_sources SET name = $name
    WHERE id = $id AND is_builtin = 0 AND archived_at IS NULL
  `,
  archiveSource: `
    UPDATE rate_sources SET archived_at = $archivedAt
    WHERE id = $id AND archived_at IS NULL
  `,
  getPreferredSource: `
    SELECT value FROM settings WHERE key = 'preferred_rate_source_id'
  `,
  setPreferredSource: `
    INSERT INTO settings (key, value) VALUES ('preferred_rate_source_id', $sourceId)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
  nextSequence: `
    SELECT COALESCE(MAX(effective_seq), -1) + 1 AS next_seq
    FROM exchange_rates
    WHERE source_id = $sourceId AND effective_date = $effectiveDate
  `,
  insertRate: `
    INSERT INTO exchange_rates (
      source_id, effective_date, effective_seq, lbp_per_usd_e4, note, created_at
    ) VALUES ($sourceId, $effectiveDate, $sequence, $rateE4, $note, $createdAt)
  `,
  listRates: `
    SELECT
      r.id, r.source_id, r.effective_date, r.effective_seq,
      r.lbp_per_usd_e4, r.note, s.code AS source_code, s.name AS source_name
    FROM exchange_rates r
    JOIN rate_sources s ON s.id = r.source_id
    ORDER BY r.effective_date DESC, r.effective_seq DESC, r.id DESC
  `,
  getRate: `
    SELECT id, source_id, effective_date, effective_seq, lbp_per_usd_e4, note
    FROM exchange_rates WHERE id = $id
  `,
  lookupRate: `
    SELECT
      r.id, r.source_id, r.effective_date, r.effective_seq,
      r.lbp_per_usd_e4, r.note, COALESCE(s.name, s.code) AS source_label
    FROM exchange_rates r
    JOIN rate_sources s ON s.id = r.source_id
    WHERE r.source_id = $sourceId AND s.archived_at IS NULL
      AND r.effective_date <= $effectiveDate
    ORDER BY r.effective_date DESC, r.effective_seq DESC
    LIMIT 1
  `,
  transactionReferenceCount: `
    SELECT count(*) AS count FROM transactions WHERE rate_id = $rateId
  `,
  updateRate: `
    UPDATE exchange_rates
    SET effective_date = $effectiveDate, effective_seq = $sequence,
        lbp_per_usd_e4 = $rateE4, note = $note
    WHERE id = $id
  `,
  deleteRate: 'DELETE FROM exchange_rates WHERE id = $id',
} as const;
