import type { DbDriver } from '@/db/driver';
import { onboardingSql } from '@/db/sql/onboarding.sql';

export type RateSourceCode = 'market' | 'official' | 'custom';
export type AccountType = 'cash' | 'bank' | 'card' | 'wallet' | 'savings' | 'other';
export type AccountCurrency = 'USD' | 'LBP';

export interface OnboardingInput {
  rateSource: RateSourceCode;
  rateDate: string;
  rateE4: bigint;
  accountName: string;
  accountType: AccountType;
  accountCurrency: AccountCurrency;
}

export interface OnboardingResult {
  accountId: number;
  rateId: number;
  rateSourceId: number;
}

export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingError';
  }
}

const RATE_SOURCES: readonly RateSourceCode[] = ['market', 'official', 'custom'];

export const DEFAULT_CATEGORIES = [
  { builtinKey: 'category.income.salary', kind: 'income' },
  { builtinKey: 'category.income.business', kind: 'income' },
  { builtinKey: 'category.income.gifts', kind: 'income' },
  { builtinKey: 'category.income.other', kind: 'income' },
  { builtinKey: 'category.expense.food', kind: 'expense' },
  { builtinKey: 'category.expense.housing', kind: 'expense' },
  { builtinKey: 'category.expense.transport', kind: 'expense' },
  { builtinKey: 'category.expense.health', kind: 'expense' },
  { builtinKey: 'category.expense.education', kind: 'expense' },
  { builtinKey: 'category.expense.utilities', kind: 'expense' },
  { builtinKey: 'category.expense.shopping', kind: 'expense' },
  { builtinKey: 'category.expense.other', kind: 'expense' },
] as const;

interface RateSourceRow {
  id: number;
}

interface SettingRow {
  value: string;
}

export async function isOnboardingComplete(database: DbDriver): Promise<boolean> {
  const row = await database.get<SettingRow>(onboardingSql.getSetupComplete);
  if (!row) return false;
  if (row.value !== '1') {
    throw new OnboardingError('The onboarding completion marker is invalid.');
  }
  return true;
}

export async function completeOnboarding(
  database: DbDriver,
  input: OnboardingInput,
  now: () => string = () => new Date().toISOString(),
): Promise<OnboardingResult> {
  validateInput(input);

  return database.exclusiveTransaction(async (transaction) => {
    const setupComplete = await transaction.get<SettingRow>(onboardingSql.getSetupComplete);
    if (setupComplete) {
      if (setupComplete.value !== '1') {
        throw new OnboardingError('The onboarding completion marker is invalid.');
      }
      throw new OnboardingError('Onboarding has already been completed.');
    }

    const timestamp = now();
    for (const code of RATE_SOURCES) {
      await transaction.run(onboardingSql.insertRateSource, {
        $code: code,
        $createdAt: timestamp,
      });
    }

    const source = await transaction.get<RateSourceRow>(onboardingSql.getRateSource, {
      $code: input.rateSource,
    });
    if (!source || !Number.isSafeInteger(source.id) || source.id < 1) {
      throw new OnboardingError('The selected rate source could not be initialized.');
    }

    const rateResult = await transaction.run(onboardingSql.insertExchangeRate, {
      $sourceId: source.id,
      $effectiveDate: input.rateDate,
      $rateE4: Number(input.rateE4),
      $createdAt: timestamp,
    });
    const rateId = toSafeId(rateResult.lastInsertRowId);

    const accountResult = await transaction.run(onboardingSql.insertAccount, {
      $name: input.accountName.trim(),
      $type: input.accountType,
      $currency: input.accountCurrency,
      $createdAt: timestamp,
      $updatedAt: timestamp,
    });
    const accountId = toSafeId(accountResult.lastInsertRowId);

    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      await transaction.run(onboardingSql.insertCategory, {
        $builtinKey: category.builtinKey,
        $kind: category.kind,
        $sortOrder: index,
        $createdAt: timestamp,
        $updatedAt: timestamp,
      });
    }

    await transaction.run(onboardingSql.setSetting, {
      $key: 'preferred_rate_source_id',
      $value: String(source.id),
    });
    await transaction.run(onboardingSql.setSetting, {
      $key: 'onboarding_complete',
      $value: '1',
    });

    return { accountId, rateId, rateSourceId: source.id };
  });
}

function validateInput(input: OnboardingInput): void {
  if (!RATE_SOURCES.includes(input.rateSource)) {
    throw new OnboardingError('Choose a supported exchange-rate source.');
  }
  if (input.rateE4 < 1n || input.rateE4 > 1_000_000_000_000n) {
    throw new OnboardingError('The exchange rate is outside the supported range.');
  }
  if (!isIsoDate(input.rateDate)) {
    throw new OnboardingError('The exchange-rate date must be a real calendar date.');
  }
  if (input.accountName.trim().length === 0) {
    throw new OnboardingError('Enter an account name.');
  }
  if (!isAccountType(input.accountType) || !isAccountCurrency(input.accountCurrency)) {
    throw new OnboardingError('Choose a supported account type and currency.');
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isAccountType(value: string): value is AccountType {
  return ['cash', 'bank', 'card', 'wallet', 'savings', 'other'].includes(value);
}

function isAccountCurrency(value: string): value is AccountCurrency {
  return value === 'USD' || value === 'LBP';
}

function toSafeId(id: number | bigint): number {
  if (typeof id === 'bigint') {
    if (id < 1n || id > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new OnboardingError('SQLite returned an invalid generated id.');
    }
    return Number(id);
  }
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new OnboardingError('SQLite returned an invalid generated id.');
  }
  return id;
}
