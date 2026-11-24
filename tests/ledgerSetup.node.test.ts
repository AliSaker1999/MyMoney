import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import {
  archiveAccount,
  archiveCategory,
  createAccount,
  createCategory,
  getOpeningBalance,
  LedgerSetupError,
  listAccounts,
  listCategories,
  setOpeningBalance,
  updateAccount,
  updateCategory,
  updateOpeningBalance,
} from '@/services/ledgerSetupService';
import { completeOnboarding, type OnboardingInput } from '@/services/onboardingService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const onboardingInput: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: 'Cash',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M7 accounts, categories, and opening balances', () => {
  let driver: BetterSqliteDriver;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates, renames, and archives accounts while preserving balances', async () => {
    const id = await createAccount(driver, {
      name: '  Bank account  ',
      type: 'bank',
      currency: 'USD',
    }, () => TIMESTAMP);

    await updateAccount(driver, id, {
      name: 'Checking',
      type: 'bank',
      currency: 'USD',
      includeInNetWorth: false,
      sortOrder: 3,
    }, () => TIMESTAMP);
    await archiveAccount(driver, id, TIMESTAMP);

    await expect(listAccounts(driver)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id,
          name: 'Checking',
          currency: 'USD',
          includeInNetWorth: false,
          sortOrder: 3,
          archivedAt: TIMESTAMP,
        }),
      ]),
    );
  });

  it('rejects duplicate account names and account currency changes', async () => {
    const cash = (await listAccounts(driver))[0]!;
    await expect(createAccount(driver, {
      name: 'cash',
      type: 'cash',
      currency: 'LBP',
    })).rejects.toThrow(LedgerSetupError);
    await expect(updateAccount(driver, cash.id, {
      name: cash.name,
      type: cash.type,
      currency: 'LBP',
    })).rejects.toThrow('currency');
  });

  it('creates custom categories and enforces same-kind subcategory parents', async () => {
    const food = (await listCategories(driver)).find((category) => category.builtinKey === 'category.expense.food')!;
    const lunch = await createCategory(driver, {
      name: '  Lunch  ',
      kind: 'expense',
      parentId: food.id,
      sortOrder: 2,
    }, () => TIMESTAMP);

    await updateCategory(driver, lunch, {
      name: 'Lunches',
      kind: 'expense',
      parentId: food.id,
      sortOrder: 4,
    }, () => TIMESTAMP);
    await archiveCategory(driver, lunch, TIMESTAMP);

    await expect(listCategories(driver)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: lunch, name: 'Lunches', kind: 'expense', parentId: food.id, archivedAt: TIMESTAMP }),
      ]),
    );
  });

  it('sets and reads one exact opening balance per account', async () => {
    const cash = (await listAccounts(driver))[0]!;
    await setOpeningBalance(driver, {
      accountId: cash.id,
      date: '2026-11-18',
      amountMinor: parseMoney('125.50', 'USD'),
      rateE4: parseRate('1,507.50'),
      memo: 'Opening',
    }, () => TIMESTAMP);

    await expect(getOpeningBalance(driver, cash.id)).resolves.toMatchObject({
      accountId: cash.id,
      date: '2026-11-18',
      currency: 'USD',
      amountMinor: 12_550n,
      usdMinor: 12_550n,
      lbpMinor: 189_191n,
      memo: 'Opening',
      rateE4: parseRate('1,507.50'),
      rateOrigin: 'manual',
    });
    await expect(setOpeningBalance(driver, {
      accountId: cash.id,
      date: '2026-11-18',
      amountMinor: parseMoney('200', 'USD'),
      rateE4: parseRate('1,507.50'),
    })).rejects.toThrow('already');

    await expect(
      driver.get<{ count: number }>(
        `SELECT count(*) AS count FROM transactions WHERE kind = 'opening_balance'`,
      ),
    ).resolves.toEqual({ count: 1 });

    await updateOpeningBalance(driver, {
      accountId: cash.id,
      date: '2026-11-19',
      amountMinor: parseMoney('150.25', 'USD'),
      rateE4: parseRate('1,600'),
    }, () => TIMESTAMP);
    await expect(getOpeningBalance(driver, cash.id)).resolves.toMatchObject({
      date: '2026-11-19',
      amountMinor: 15_025n,
      usdMinor: 15_025n,
      lbpMinor: 240_400n,
      rateE4: parseRate('1,600'),
    });
  });

  it('rejects invalid opening-balance dates and amounts', async () => {
    const cash = (await listAccounts(driver))[0]!;
    await expect(setOpeningBalance(driver, {
      accountId: cash.id,
      date: '2026-02-29',
      amountMinor: parseMoney('10', 'USD'),
      rateE4: parseRate('1,507.50'),
    })).rejects.toThrow(LedgerSetupError);
    await expect(setOpeningBalance(driver, {
      accountId: cash.id,
      date: '2026-11-18',
      amountMinor: 0n,
      rateE4: parseRate('1,507.50'),
    })).rejects.toThrow(LedgerSetupError);
  });
});
