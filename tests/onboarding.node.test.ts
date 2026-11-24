import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { onboardingSql } from '@/db/sql/onboarding.sql';
import { parseRate } from '@/domain/money';
import {
  completeOnboarding,
  DEFAULT_CATEGORIES,
  isOnboardingComplete,
  OnboardingError,
  type OnboardingInput,
} from '@/services/onboardingService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';

const input: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: '  Daily cash  ',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M5 onboarding service', () => {
  let driver: BetterSqliteDriver;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates built-in sources, the first real quote, an account, and categories atomically', async () => {
    const sourcesBefore = await driver.get<{ count: number }>(
      'SELECT count(*) AS count FROM rate_sources',
    );
    expect(sourcesBefore?.count).toBe(0);
    expect(await isOnboardingComplete(driver)).toBe(false);

    const result = await completeOnboarding(driver, input, () => TIMESTAMP);

    expect(result).toEqual({ accountId: 1, rateId: 1, rateSourceId: 1 });
    expect(await isOnboardingComplete(driver)).toBe(true);
    await expect(
      driver.get<{ id: number; name: string; type: string; currency: string }>(
        'SELECT id, name, type, currency FROM accounts WHERE id = $id',
        { $id: result.accountId },
      ),
    ).resolves.toEqual({
      id: result.accountId,
      name: 'Daily cash',
      type: 'cash',
      currency: 'USD',
    });
    await expect(
      driver.get<{ lbp_per_usd_e4: number; effective_date: string }>(
        'SELECT lbp_per_usd_e4, effective_date FROM exchange_rates WHERE id = $id',
        { $id: result.rateId },
      ),
    ).resolves.toEqual({ lbp_per_usd_e4: 15_075_000, effective_date: input.rateDate });
    await expect(
      driver.get<{ value: string }>(onboardingSql.getPreferredRateSourceId),
    ).resolves.toEqual({ value: String(result.rateSourceId) });
    await expect(
      driver.get<{ count: number }>('SELECT count(*) AS count FROM rate_sources'),
    ).resolves.toEqual({ count: 3 });
    await expect(
      driver.get<{ count: number }>('SELECT count(*) AS count FROM categories'),
    ).resolves.toEqual({ count: DEFAULT_CATEGORIES.length });
  });

  it.each([
    { ...input, rateDate: '2026-02-29' },
    { ...input, rateE4: 0n },
    { ...input, accountName: '   ' },
  ])('rejects invalid onboarding input before writing', async (invalidInput) => {
    await expect(
      completeOnboarding(driver, invalidInput, () => TIMESTAMP),
    ).rejects.toThrow(OnboardingError);

    await expect(
      driver.get<{ count: number }>('SELECT count(*) AS count FROM accounts'),
    ).resolves.toEqual({ count: 0 });
    expect(await isOnboardingComplete(driver)).toBe(false);
  });

  it('does not duplicate seed data or rates after onboarding is complete', async () => {
    await completeOnboarding(driver, input, () => TIMESTAMP);

    await expect(
      completeOnboarding(driver, { ...input, rateDate: '2026-11-19' }, () => TIMESTAMP),
    ).rejects.toThrow('already been completed');
    await expect(
      driver.get<{ count: number }>('SELECT count(*) AS count FROM exchange_rates'),
    ).resolves.toEqual({ count: 1 });
  });

  it('surfaces a malformed onboarding marker instead of treating it as an unconfigured ledger', async () => {
    await driver.run(onboardingSql.setSetting, {
      $key: 'onboarding_complete',
      $value: 'unknown',
    });

    await expect(isOnboardingComplete(driver)).rejects.toThrow(OnboardingError);
    await expect(completeOnboarding(driver, input, () => TIMESTAMP)).rejects.toThrow(
      OnboardingError,
    );
  });
});
