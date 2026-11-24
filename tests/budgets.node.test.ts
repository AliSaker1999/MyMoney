import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import {
  createBudget,
  deleteBudget,
  getBudget,
  getBudgetExpenseTracking,
  getBudgetsByMonth,
  listBudgets,
  updateBudget,
  BudgetServiceError,
  validateBudgetInput,
  validateMonthFormat,
  type BudgetInput,
} from '@/services/budgetService';
import { createTransaction } from '@/services/ledgerService';
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

describe('M14 budgets: create, update, delete, expense tracking', () => {
  let driver: BetterSqliteDriver;
  let accountId: number;
  let expenseCategoryId: number;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);

    const accounts = await listAccounts(driver);
    accountId = accounts[0]!.id;

    const categories = await listCategories(driver);
    expenseCategoryId = categories.find((c) => c.builtinKey === 'category.expense.food')!.id;
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates, reads, updates, and deletes budgets', async () => {
    // CREATE
    const budgetId = await createBudget(driver, {
      categoryId: expenseCategoryId,
      currency: 'USD',
      amountMinor: parseMoney('100', 'USD'),
      startMonth: '2026-11',
      endMonth: null,
    }, () => TIMESTAMP);

    expect(budgetId).toBeGreaterThan(0);

    // READ single
    const budget = await getBudget(driver, budgetId);
    expect(budget).toMatchObject({
      id: budgetId,
      categoryId: expenseCategoryId,
      currency: 'USD',
      amountMinor: 10_000n,
      startMonth: '2026-11',
      endMonth: null,
    });

    // READ all
    const budgets = await listBudgets(driver);
    expect(budgets.length).toBe(1);
    expect(budgets[0]).toMatchObject({ id: budgetId });

    // UPDATE
    await updateBudget(driver, budgetId, {
      categoryId: expenseCategoryId,
      currency: 'USD',
      amountMinor: parseMoney('200', 'USD'),
      startMonth: '2026-11',
      endMonth: '2026-12',
    }, () => TIMESTAMP);

    const updated = await getBudget(driver, budgetId);
    expect(updated?.amountMinor).toBe(20_000n);
    expect(updated?.endMonth).toBe('2026-12');

    // DELETE
    await deleteBudget(driver, budgetId);
    const deleted = await getBudget(driver, budgetId);
    expect(deleted).toBeNull();
  });

  it('detects overlapping budgets in same category', async () => {
    // Create first budget
    await createBudget(driver, {
      categoryId: expenseCategoryId,
      currency: 'USD',
      amountMinor: parseMoney('100', 'USD'),
      startMonth: '2026-11',
      endMonth: '2026-11',
    }, () => TIMESTAMP);

    // Try to create overlapping budget for same category
    await expect(
      createBudget(driver, {
        categoryId: expenseCategoryId,
        currency: 'USD',
        amountMinor: parseMoney('50', 'USD'),
        startMonth: '2026-11',
        endMonth: null,
      }, () => TIMESTAMP)
    ).rejects.toThrow(BudgetServiceError);
  });

  it('allows budgets in different categories with same period', async () => {
    const categories = await listCategories(driver);
    const foodCategoryId = categories.find((c) => c.builtinKey === 'category.expense.food')!.id;
    const transportCategoryId = categories.find((c) => c.builtinKey === 'category.expense.transport')!.id;

    const budget1Id = await createBudget(driver, {
      categoryId: foodCategoryId,
      currency: 'USD',
      amountMinor: parseMoney('100', 'USD'),
      startMonth: '2026-11',
    }, () => TIMESTAMP);

    const budget2Id = await createBudget(driver, {
      categoryId: transportCategoryId,
      currency: 'USD',
      amountMinor: parseMoney('50', 'USD'),
      startMonth: '2026-11',
    }, () => TIMESTAMP);

    expect(budget1Id).not.toBe(budget2Id);
    const budgets = await listBudgets(driver);
    expect(budgets.length).toBe(2);
  });

  it('tracks spending against budget for a month', async () => {
    // Create budget for $100
    const budgetId = await createBudget(driver, {
      categoryId: expenseCategoryId,
      currency: 'USD',
      amountMinor: parseMoney('100', 'USD'),
      startMonth: '2026-11',
    }, () => TIMESTAMP);

    // No expenses yet
    let tracking = await getBudgetExpenseTracking(driver, expenseCategoryId, '2026-11');
    expect(tracking).toMatchObject({
      id: budgetId,
      amountMinor: 10_000n,
      spentUsdMinor: 0n,
      spentPercentage: 0,
      isOverBudget: false,
    });

    // Add $30 expense
    await createTransaction(driver, {
      kind: 'expense',
      date: '2026-11-18',
      accountId,
      categoryId: expenseCategoryId,
      amountMinor: parseMoney('30', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    tracking = await getBudgetExpenseTracking(driver, expenseCategoryId, '2026-11');
    expect(tracking?.spentUsdMinor).toBe(3_000n);
    expect(tracking?.spentPercentage).toBe(30);
    expect(tracking?.isOverBudget).toBe(false);

    // Add $80 more (total $110, over budget)
    await createTransaction(driver, {
      kind: 'expense',
      date: '2026-11-19',
      accountId,
      categoryId: expenseCategoryId,
      amountMinor: parseMoney('80', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    tracking = await getBudgetExpenseTracking(driver, expenseCategoryId, '2026-11');
    expect(tracking?.spentUsdMinor).toBe(11_000n);
    expect(tracking?.spentPercentage).toBe(110);
    expect(tracking?.isOverBudget).toBe(true);
  });

  it('gets all active budgets for a month', async () => {
    const categories = await listCategories(driver);
    const foodId = categories.find((c) => c.builtinKey === 'category.expense.food')!.id;
    const transportId = categories.find((c) => c.builtinKey === 'category.expense.transport')!.id;

    // Create budgets with different periods
    const budget1 = await createBudget(driver, {
      categoryId: foodId,
      currency: 'USD',
      amountMinor: parseMoney('100', 'USD'),
      startMonth: '2026-10',
      endMonth: null, // Open-ended
    }, () => TIMESTAMP);

    const budget2 = await createBudget(driver, {
      categoryId: transportId,
      currency: 'USD',
      amountMinor: parseMoney('50', 'USD'),
      startMonth: '2026-11',
      endMonth: '2026-11', // Single month
    }, () => TIMESTAMP);

    // Create expense in both
    await createTransaction(driver, {
      kind: 'expense',
      date: '2026-11-18',
      accountId,
      categoryId: foodId,
      amountMinor: parseMoney('20', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    await createTransaction(driver, {
      kind: 'expense',
      date: '2026-11-19',
      accountId,
      categoryId: transportId,
      amountMinor: parseMoney('10', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    // Get budgets for 2026-11
    const budgets = await getBudgetsByMonth(driver, '2026-11');
    expect(budgets.length).toBe(2);

    // Find each budget and verify spending
    const food = budgets.find((b) => b.id === budget1);
    expect(food).toMatchObject({
      spentUsdMinor: 2_000n,
      spentPercentage: 20,
      isOverBudget: false,
    });

    const transport = budgets.find((b) => b.id === budget2);
    expect(transport).toMatchObject({
      spentUsdMinor: 1_000n,
      spentPercentage: 20,
      isOverBudget: false,
    });
  });

  it('validates budget input', () => {
    // Negative amount
    expect(() => {
      validateBudgetInput({
        categoryId: expenseCategoryId,
        currency: 'USD',
        amountMinor: -100n,
        startMonth: '2026-11',
      });
    }).toThrow(BudgetServiceError);

    // Invalid month format
    expect(() => {
      validateBudgetInput({
        categoryId: expenseCategoryId,
        currency: 'USD',
        amountMinor: 10_000n,
        startMonth: 'invalid',
      });
    }).toThrow(BudgetServiceError);

    // End before start
    expect(() => {
      validateBudgetInput({
        categoryId: expenseCategoryId,
        currency: 'USD',
        amountMinor: 10_000n,
        startMonth: '2026-12',
        endMonth: '2026-11',
      });
    }).toThrow(BudgetServiceError);

    // Invalid currency
    expect(() => {
      validateBudgetInput({
        categoryId: expenseCategoryId,
        currency: 'EUR' as any,
        amountMinor: 10_000n,
        startMonth: '2026-11',
      });
    }).toThrow(BudgetServiceError);
  });

  it('validates month format', () => {
    expect(() => validateMonthFormat('2026-11')).not.toThrow();
    expect(() => validateMonthFormat('2026-13')).toThrow(BudgetServiceError);
    expect(() => validateMonthFormat('2026-00')).toThrow(BudgetServiceError);
    expect(() => validateMonthFormat('invalid')).toThrow(BudgetServiceError);
  });

  it('rejects budgets for income categories', async () => {
    const categories = await listCategories(driver);
    const incomeCategory = categories.find((c) => c.builtinKey === 'category.income.salary')!;

    await expect(
      createBudget(driver, {
        categoryId: incomeCategory.id,
        currency: 'USD',
        amountMinor: parseMoney('100', 'USD'),
        startMonth: '2026-11',
      }, () => TIMESTAMP)
    ).rejects.toThrow(BudgetServiceError);
  });
});
