import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  LedgerServiceError,
  listTransactions,
  updateTransaction,
} from '@/services/ledgerService';
import { completeOnboarding, type OnboardingInput } from '@/services/onboardingService';
import { listAccounts, listCategories } from '@/services/ledgerSetupService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const onboardingInput: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: 'Cash',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M8 income, expense, and refund transactions', () => {
  let driver: BetterSqliteDriver;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates, edits, lists, and deletes signed flow transactions', async () => {
    const account = (await listAccounts(driver))[0]!;
    const incomeCategory = (await listCategories(driver)).find((category) => category.builtinKey === 'category.income.salary')!;
    const expenseCategory = (await listCategories(driver)).find((category) => category.builtinKey === 'category.expense.food')!;

    const incomeId = await createTransaction(driver, {
      kind: 'income',
      date: '2026-11-18',
      accountId: account.id,
      categoryId: incomeCategory.id,
      amountMinor: parseMoney('125.50', 'USD'),
      rateE4: parseRate('1,507.50'),
      payee: 'Employer',
    }, () => TIMESTAMP);
    const expenseId = await createTransaction(driver, {
      kind: 'expense',
      date: '2026-11-18',
      accountId: account.id,
      categoryId: expenseCategory.id,
      amountMinor: parseMoney('20', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);
    const refundId = await createTransaction(driver, {
      kind: 'refund',
      date: '2026-11-18',
      accountId: account.id,
      categoryId: expenseCategory.id,
      amountMinor: parseMoney('5', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    await expect(getTransaction(driver, incomeId)).resolves.toMatchObject({
      kind: 'income',
      entries: [expect.objectContaining({ amountMinor: 12_550n, currency: 'USD' })],
    });
    await expect(getTransaction(driver, expenseId)).resolves.toMatchObject({
      kind: 'expense',
      entries: [expect.objectContaining({ amountMinor: -2_000n })],
    });
    await expect(getTransaction(driver, refundId)).resolves.toMatchObject({
      kind: 'refund',
      entries: [expect.objectContaining({ amountMinor: 500n })],
    });
    await expect(listTransactions(driver)).resolves.toHaveLength(3);

    await updateTransaction(driver, expenseId, {
      kind: 'expense',
      date: '2026-11-19',
      accountId: account.id,
      categoryId: expenseCategory.id,
      amountMinor: parseMoney('25', 'USD'),
      rateE4: parseRate('1,600'),
      note: 'Updated',
    }, () => TIMESTAMP);
    await expect(getTransaction(driver, expenseId)).resolves.toMatchObject({
      date: '2026-11-19',
      rateE4: parseRate('1,600'),
      note: 'Updated',
      entries: [expect.objectContaining({ amountMinor: -2_500n, lbpMinor: -40_000n })],
    });

    await deleteTransaction(driver, refundId);
    await expect(getTransaction(driver, refundId)).resolves.toBeNull();
  });

  it('rejects mismatched categories and invalid dates', async () => {
    const account = (await listAccounts(driver))[0]!;
    const expenseCategory = (await listCategories(driver)).find((category) => category.builtinKey === 'category.expense.food')!;
    await expect(createTransaction(driver, {
      kind: 'income',
      date: '2026-02-29',
      accountId: account.id,
      categoryId: expenseCategory.id,
      amountMinor: parseMoney('10', 'USD'),
      rateE4: parseRate('1,507.50'),
    })).rejects.toThrow(LedgerServiceError);

    await expect(createTransaction(driver, {
      kind: 'income',
      date: '2026-11-18',
      accountId: account.id,
      categoryId: expenseCategory.id,
      amountMinor: parseMoney('10', 'USD'),
      rateE4: parseRate('1,507.50'),
    })).rejects.toThrow(LedgerServiceError);
  });
});
