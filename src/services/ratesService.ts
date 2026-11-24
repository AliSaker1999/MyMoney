import type { DbDriver } from '@/db/driver';
import { ratesSql } from '@/db/sql/rates.sql';
import type { RateSourceCode } from '@/services/onboardingService';

export interface RateSource {
  id: number;
  code: RateSourceCode | null;
  name: string | null;
  is_builtin: 0 | 1;
  archived_at: string | null;
}

export interface RateQuote {
  id: number;
  sourceId: number;
  sourceCode: RateSourceCode | null;
  sourceName: string | null;
  effectiveDate: string;
  sequence: number;
  rateE4: bigint;
  note: string | null;
}

export interface RateLookup extends RateQuote {
  sourceLabel: string;
  ageDays: number;
  isStale: boolean;
}

interface RateSourceRow {
  id: number;
  code: string | null;
  name: string | null;
  is_builtin: number;
  archived_at: string | null;
}

interface RateRow {
  id: number;
  source_id: number;
  source_code?: string | null;
  source_name?: string | null;
  source_label?: string;
  effective_date: string;
  effective_seq: number;
  lbp_per_usd_e4: number;
  note: string | null;
}

interface IdRow {
  id: number;
}

interface SequenceRow {
  next_seq: number;
}

interface SettingRow {
  value: string;
}

interface CountRow {
  count: number;
}

export interface RateInput {
  effectiveDate: string;
  rateE4: bigint;
  note: string | null;
}

export class RateServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateServiceError';
  }
}

export async function listRateSources(database: DbDriver): Promise<RateSource[]> {
  const rows = await database.all<RateSourceRow>(ratesSql.listSources);
  return rows.map(mapRateSource);
}

export async function createRateSource(
  database: DbDriver,
  name: string,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  const normalizedName = validateSourceName(name);
  return database.exclusiveTransaction(async (transaction) => {
    const duplicate = await transaction.get<IdRow>(ratesSql.findSourceByName, {
      $name: normalizedName,
    });
    if (duplicate) throw new RateServiceError('A rate source with this name already exists.');
    const result = await transaction.run(ratesSql.insertCustomSource, {
      $name: normalizedName,
      $createdAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function renameRateSource(
  database: DbDriver,
  sourceId: number,
  name: string,
): Promise<void> {
  const normalizedName = validateSourceName(name);
  await database.exclusiveTransaction(async (transaction) => {
    const source = await getSource(transaction, sourceId);
    if (!source || source.is_builtin === 1 || source.archived_at !== null) {
      throw new RateServiceError('Only active custom rate sources can be renamed.');
    }
    const duplicate = await transaction.get<IdRow>(ratesSql.findSourceByName, {
      $name: normalizedName,
    });
    if (duplicate && duplicate.id !== sourceId) {
      throw new RateServiceError('A rate source with this name already exists.');
    }
    const result = await transaction.run(ratesSql.renameCustomSource, {
      $id: sourceId,
      $name: normalizedName,
    });
    if (result.changes !== 1) throw new RateServiceError('The rate source was not renamed.');
  });
}

export async function archiveRateSource(
  database: DbDriver,
  sourceId: number,
  archivedAt: string = new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const source = await getSource(transaction, sourceId);
    if (!source || source.archived_at !== null) {
      throw new RateServiceError('The rate source is unavailable.');
    }
    const preferred = await transaction.get<SettingRow>(ratesSql.getPreferredSource);
    if (preferred && parseSourceId(preferred.value) === sourceId) {
      throw new RateServiceError('Choose a different preferred source before archiving this one.');
    }
    const result = await transaction.run(ratesSql.archiveSource, {
      $id: sourceId,
      $archivedAt: archivedAt,
    });
    if (result.changes !== 1) throw new RateServiceError('The rate source was not archived.');
  });
}

export async function setPreferredRateSource(
  database: DbDriver,
  sourceId: number,
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const source = await getSource(transaction, sourceId);
    if (!source || source.archived_at !== null) {
      throw new RateServiceError('Choose an active rate source.');
    }
    await transaction.run(ratesSql.setPreferredSource, { $sourceId: String(sourceId) });
  });
}

export async function getPreferredRateSourceId(database: DbDriver): Promise<number | null> {
  const row = await database.get<SettingRow>(ratesSql.getPreferredSource);
  return row ? parseSourceId(row.value) : null;
}

export async function listRateQuotes(database: DbDriver): Promise<RateQuote[]> {
  const rows = await database.all<RateRow>(ratesSql.listRates);
  return rows.map(mapRateQuote);
}

export async function addRateQuote(
  database: DbDriver,
  sourceId: number,
  input: RateInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateRateInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    await requireActiveSource(transaction, sourceId);
    const sequence = await nextSequence(transaction, sourceId, input.effectiveDate);
    const result = await transaction.run(ratesSql.insertRate, {
      $sourceId: sourceId,
      $effectiveDate: input.effectiveDate,
      $sequence: sequence,
      $rateE4: Number(input.rateE4),
      $note: normalizeNote(input.note),
      $createdAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function updateRateQuote(
  database: DbDriver,
  rateId: number,
  input: RateInput,
): Promise<void> {
  validateRateInput(input);
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<RateRow>(ratesSql.getRate, { $id: rateId });
    if (!current) throw new RateServiceError('The exchange-rate quote is unavailable.');
    const source = await requireActiveSource(transaction, current.source_id);
    const sequence =
      current.effective_date === input.effectiveDate
        ? current.effective_seq
        : await nextSequence(transaction, source.id, input.effectiveDate);
    const result = await transaction.run(ratesSql.updateRate, {
      $id: rateId,
      $effectiveDate: input.effectiveDate,
      $sequence: sequence,
      $rateE4: Number(input.rateE4),
      $note: normalizeNote(input.note),
    });
    if (result.changes !== 1) throw new RateServiceError('The exchange-rate quote was not updated.');
  });
}

export async function deleteRateQuote(
  database: DbDriver,
  rateId: number,
): Promise<{ transactionReferences: number }> {
  return database.exclusiveTransaction(async (transaction) => {
    const transactionReferences = await getRateQuoteReferenceCount(transaction, rateId);
    const result = await transaction.run(ratesSql.deleteRate, { $id: rateId });
    if (result.changes !== 1) throw new RateServiceError('The exchange-rate quote is unavailable.');
    return { transactionReferences };
  });
}

export async function getRateQuoteReferenceCount(
  database: DbDriver,
  rateId: number,
): Promise<number> {
  const reference = await database.get<CountRow>(ratesSql.transactionReferenceCount, {
    $rateId: rateId,
  });
  if (!reference || !Number.isSafeInteger(reference.count) || reference.count < 0) {
    throw new RateServiceError('The quote transaction-reference count is invalid.');
  }
  return reference.count;
}

export async function lookupRate(
  database: DbDriver,
  sourceId: number,
  effectiveDate: string,
): Promise<RateLookup | null> {
  validateIsoDate(effectiveDate);
  await requireActiveSource(database, sourceId);
  const row = await database.get<RateRow>(ratesSql.lookupRate, {
    $sourceId: sourceId,
    $effectiveDate: effectiveDate,
  });
  if (!row) return null;
  const quote = mapRateQuote(row);
  const ageDays = calendarDaysBetween(quote.effectiveDate, effectiveDate);
  return {
    ...quote,
    sourceLabel: row.source_label ?? '',
    ageDays,
    isStale: ageDays > 7,
  };
}

function mapRateSource(row: RateSourceRow): RateSource {
  if (row.code !== null && !isRateSourceCode(row.code)) {
    throw new RateServiceError('The database contains an unsupported built-in rate source.');
  }
  if (row.is_builtin !== 0 && row.is_builtin !== 1) {
    throw new RateServiceError('The database contains an invalid rate-source type.');
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    is_builtin: row.is_builtin,
    archived_at: row.archived_at,
  };
}

function mapRateQuote(row: RateRow): RateQuote {
  const sourceCode = row.source_code;
  if (sourceCode !== undefined && sourceCode !== null && !isRateSourceCode(sourceCode)) {
    throw new RateServiceError('The database contains an unsupported built-in rate source.');
  }
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceCode: sourceCode ?? null,
    sourceName: row.source_name ?? null,
    effectiveDate: row.effective_date,
    sequence: row.effective_seq,
    rateE4: BigInt(row.lbp_per_usd_e4),
    note: row.note,
  };
}

async function getSource(database: DbDriver, id: number): Promise<RateSource | null> {
  const row = await database.get<RateSourceRow>(ratesSql.getSource, { $id: id });
  return row ? mapRateSource(row) : null;
}

async function requireActiveSource(database: DbDriver, id: number): Promise<RateSource> {
  const source = await getSource(database, id);
  if (!source || source.archived_at !== null) {
    throw new RateServiceError('Choose an active rate source.');
  }
  return source;
}

async function nextSequence(
  database: DbDriver,
  sourceId: number,
  effectiveDate: string,
): Promise<number> {
  const row = await database.get<SequenceRow>(ratesSql.nextSequence, {
    $sourceId: sourceId,
    $effectiveDate: effectiveDate,
  });
  if (!row || !Number.isSafeInteger(row.next_seq) || row.next_seq < 0) {
    throw new RateServiceError('A valid quote sequence could not be calculated.');
  }
  return row.next_seq;
}

function validateSourceName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > 100) {
    throw new RateServiceError('Rate-source names must contain 1 to 100 characters.');
  }
  return name;
}

function validateRateInput(input: RateInput): void {
  validateIsoDate(input.effectiveDate);
  if (input.rateE4 < 1n || input.rateE4 > 1_000_000_000_000n) {
    throw new RateServiceError('The exchange rate is outside the supported range.');
  }
  if (input.note !== null && input.note.length > 500) {
    throw new RateServiceError('Rate notes may not exceed 500 characters.');
  }
}

function validateIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RateServiceError('The date must use YYYY-MM-DD format.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RateServiceError('The date must be a real calendar date.');
  }
}

function calendarDaysBetween(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const toTime = Date.parse(`${to}T00:00:00.000Z`);
  const days = (toTime - fromTime) / 86_400_000;
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RateServiceError('The rate quote date is after the requested date.');
  }
  return days;
}

function parseSourceId(value: string): number {
  const sourceId = Number(value);
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
    throw new RateServiceError('The preferred rate source setting is invalid.');
  }
  return sourceId;
}

function toSafeId(id: number | bigint): number {
  if (typeof id === 'bigint') {
    if (id < 1n || id > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RateServiceError('SQLite returned an invalid generated id.');
    }
    return Number(id);
  }
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new RateServiceError('SQLite returned an invalid generated id.');
  }
  return id;
}

function isRateSourceCode(value: string): value is RateSourceCode {
  return value === 'market' || value === 'official' || value === 'custom';
}

function normalizeNote(note: string | null): string | null {
  const normalized = note?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}
