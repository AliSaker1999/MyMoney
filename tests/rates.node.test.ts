import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseRate } from '@/domain/money';
import { completeOnboarding, type OnboardingInput } from '@/services/onboardingService';
import {
  addRateQuote,
  archiveRateSource,
  createRateSource,
  deleteRateQuote,
  getRateQuoteReferenceCount,
  listRateQuotes,
  listRateSources,
  lookupRate,
  RateServiceError,
  renameRateSource,
  setPreferredRateSource,
  updateRateQuote,
} from '@/services/ratesService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const onboardingInput: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: 'Cash',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M6 exchange-rate service', () => {
  let driver: BetterSqliteDriver;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates ordered same-day quotes and resolves only within the selected source', async () => {
    const sources = await listRateSources(driver);
    const market = sources.find((source) => source.code === 'market');
    const official = sources.find((source) => source.code === 'official');
    expect(market).toBeDefined();
    expect(official).toBeDefined();

    const secondQuoteId = await addRateQuote(
      driver,
      market!.id,
      { effectiveDate: '2026-11-18', rateE4: parseRate('1,600'), note: null },
      () => TIMESTAMP,
    );
    const quotes = await listRateQuotes(driver);
    expect(quotes.find((quote) => quote.id === secondQuoteId)?.sequence).toBe(1);

    await expect(lookupRate(driver, market!.id, '2026-11-18')).resolves.toMatchObject({
      id: secondQuoteId,
      rateE4: parseRate('1,600'),
      ageDays: 0,
      isStale: false,
    });
    await expect(lookupRate(driver, official!.id, '2026-11-18')).resolves.toBeNull();
    await expect(lookupRate(driver, market!.id, '2026-11-17')).resolves.toBeNull();
  });

  it('marks quotes stale only after seven full calendar days', async () => {
    const market = (await listRateSources(driver)).find((source) => source.code === 'market');
    expect(market).toBeDefined();

    await expect(lookupRate(driver, market!.id, '2026-11-25')).resolves.toMatchObject({
      ageDays: 7,
      isStale: false,
    });
    await expect(lookupRate(driver, market!.id, '2026-11-26')).resolves.toMatchObject({
      ageDays: 8,
      isStale: true,
    });
  });

  it('validates source names, prevents archiving the preferred source, and preserves archived sources', async () => {
    const sourceId = await createRateSource(driver, '  Travel cash  ');
    await expect(createRateSource(driver, 'travel CASH')).rejects.toThrow(RateServiceError);
    await renameRateSource(driver, sourceId, 'Travel spending');
    await expect(archiveRateSource(driver, 1, TIMESTAMP)).rejects.toThrow('preferred source');

    const official = (await listRateSources(driver)).find((source) => source.code === 'official');
    expect(official).toBeDefined();
    await setPreferredRateSource(driver, official!.id);
    await archiveRateSource(driver, sourceId, TIMESTAMP);
    await expect(lookupRate(driver, sourceId, '2026-11-18')).rejects.toThrow(RateServiceError);

    await expect(listRateSources(driver)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sourceId, name: 'Travel spending', archived_at: TIMESTAMP }),
      ]),
    );
  });

  it('updates quotes without moving their effective order on the same day', async () => {
    const market = (await listRateSources(driver)).find((source) => source.code === 'market');
    expect(market).toBeDefined();
    const quoteId = await addRateQuote(driver, market!.id, {
      effectiveDate: '2026-11-18',
      rateE4: parseRate('1,600'),
      note: 'First',
    });

    await updateRateQuote(driver, quoteId, {
      effectiveDate: '2026-11-18',
      rateE4: parseRate('1,700'),
      note: 'Updated',
    });
    await expect(lookupRate(driver, market!.id, '2026-11-18')).resolves.toMatchObject({
      id: quoteId,
      sequence: 1,
      rateE4: parseRate('1,700'),
      note: 'Updated',
    });

    await updateRateQuote(driver, quoteId, {
      effectiveDate: '2026-11-19',
      rateE4: parseRate('1,800'),
      note: null,
    });
    await expect(lookupRate(driver, market!.id, '2026-11-19')).resolves.toMatchObject({
      id: quoteId,
      effectiveDate: '2026-11-19',
      sequence: 0,
    });
  });

  it('deletes a quote without changing transaction rate snapshots', async () => {
    const market = (await listRateSources(driver)).find((source) => source.code === 'market');
    expect(market).toBeDefined();
    const quoteId = await addRateQuote(driver, market!.id, {
      effectiveDate: '2026-11-18',
      rateE4: parseRate('1,600'),
      note: null,
    });
    await driver.run(
      `INSERT INTO transactions (
        kind, date, lbp_per_usd_e4, rate_origin, rate_source_id,
        rate_source_label, rate_id, rate_date, created_at, updated_at
      ) VALUES (
        'income', '2026-11-18', 16000000, 'source', $sourceId,
        'Market', $rateId, '2026-11-18', $timestamp, $timestamp
      )`,
      { $sourceId: market!.id, $rateId: quoteId, $timestamp: TIMESTAMP },
    );

    await expect(getRateQuoteReferenceCount(driver, quoteId)).resolves.toBe(1);
    await expect(deleteRateQuote(driver, quoteId)).resolves.toEqual({ transactionReferences: 1 });
    await expect(
      driver.get<{ lbp_per_usd_e4: number; rate_source_label: string; rate_id: number | null }>(
        'SELECT lbp_per_usd_e4, rate_source_label, rate_id FROM transactions',
      ),
    ).resolves.toEqual({
      lbp_per_usd_e4: 16_000_000,
      rate_source_label: 'Market',
      rate_id: null,
    });
  });

  it('rejects invalid quote values and calendar dates without inserting them', async () => {
    const market = (await listRateSources(driver)).find((source) => source.code === 'market');
    expect(market).toBeDefined();

    await expect(
      addRateQuote(driver, market!.id, {
        effectiveDate: '2026-02-29',
        rateE4: parseRate('1,600'),
        note: null,
      }),
    ).rejects.toThrow(RateServiceError);
    await expect(
      addRateQuote(driver, market!.id, {
        effectiveDate: '2026-11-18',
        rateE4: 1_000_000_000_001n,
        note: null,
      }),
    ).rejects.toThrow(RateServiceError);
    await expect(
      addRateQuote(driver, market!.id, {
        effectiveDate: '2026-11-18',
        rateE4: parseRate('1,600'),
        note: 'x'.repeat(501),
      }),
    ).rejects.toThrow(RateServiceError);

    await expect(
      driver.get<{ count: number }>('SELECT count(*) AS count FROM exchange_rates'),
    ).resolves.toEqual({ count: 1 });
  });
});
