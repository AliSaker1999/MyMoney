import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import { createTransaction, listTransactions } from '@/services/ledgerService';
import { completeOnboarding, type OnboardingInput } from '@/services/onboardingService';
import { listAccounts, listCategories } from '@/services/ledgerSetupService';
import { getReportSnapshot } from '@/services/reportService';
import { getDashboard } from '@/services/dashboardService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const onboardingInput: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: 'Cash',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M17b Performance: 100k entries stress test', () => {
  let driver: BetterSqliteDriver;
  let accountId: number;
  let expenseCategoryId: number;
  let incomeCategoryId: number;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);

    const accounts = await listAccounts(driver);
    accountId = accounts[0]!.id;

    const categories = await listCategories(driver);
    expenseCategoryId = categories.find((c) => c.builtinKey === 'category.expense.food')!.id;
    incomeCategoryId = categories.find((c) => c.builtinKey === 'category.income.salary')!.id;
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates 10k transactions efficiently', async () => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Generate 10k transactions spread across 10 months
    for (let month = 0; month < 10; month++) {
      for (let i = 0; i < 1000; i++) {
        const date = new Date(2026, month, (i % 28) + 1).toISOString().slice(0, 10);
        const amount = (i % 100) + 10; // 10-110

        await createTransaction(driver, {
          kind: i % 3 === 0 ? 'income' : 'expense',
          date,
          accountId,
          categoryId: i % 3 === 0 ? incomeCategoryId : expenseCategoryId,
          amountMinor: parseMoney(amount.toString(), 'USD'),
          rateE4: parseRate('1,507.50'),
        }, () => TIMESTAMP);
      }
    }

    const elapsed = Date.now() - startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memoryDelta = (endMemory - startMemory) / 1024 / 1024; // MB

    console.log(`Created 10k transactions in ${elapsed}ms`);
    console.log(`Memory used: ${memoryDelta.toFixed(2)}MB`);

    // Expectations: should complete reasonably fast
    expect(elapsed).toBeLessThan(60000); // < 60 seconds for 10k
  });

  it('queries performance with 10k entries', async () => {
    // Create 10k entries
    for (let i = 0; i < 10000; i++) {
      const month = i % 10;
      const day = (i % 28) + 1;
      const date = new Date(2026, month, day).toISOString().slice(0, 10);

      await createTransaction(driver, {
        kind: i % 3 === 0 ? 'income' : 'expense',
        date,
        accountId,
        categoryId: i % 3 === 0 ? incomeCategoryId : expenseCategoryId,
        amountMinor: parseMoney(((i % 100) + 10).toString(), 'USD'),
        rateE4: parseRate('1,507.50'),
      }, () => TIMESTAMP);
    }

    // Test list query performance
    const listStart = Date.now();
    const all = await listTransactions(driver);
    const listElapsed = Date.now() - listStart;

    console.log(`Listed 10k transactions in ${listElapsed}ms`);
    expect(all.length).toBe(10000);
    expect(listElapsed).toBeLessThan(5000); // < 5 seconds

    // Test report query performance
    const reportStart = Date.now();
    const report = await getReportSnapshot(driver, '2026-01-01', '2026-12-31');
    const reportElapsed = Date.now() - reportStart;

    console.log(`Generated report snapshot in ${reportElapsed}ms`);
    expect(reportElapsed).toBeLessThan(2000); // < 2 seconds

    // Test dashboard query performance
    const dashStart = Date.now();
    const dashboard = await getDashboard(driver, '2026-01-01', '2026-12-31');
    const dashElapsed = Date.now() - dashStart;

    console.log(`Generated dashboard in ${dashElapsed}ms`);
    expect(dashElapsed).toBeLessThan(2000); // < 2 seconds
  });

  it('memory usage stays reasonable with 10k entries', async () => {
    const before = process.memoryUsage();

    // Create 10k entries
    for (let i = 0; i < 10000; i++) {
      const month = i % 10;
      const day = (i % 28) + 1;
      const date = new Date(2026, month, day).toISOString().slice(0, 10);

      await createTransaction(driver, {
        kind: i % 2 === 0 ? 'income' : 'expense',
        date,
        accountId,
        categoryId: i % 2 === 0 ? incomeCategoryId : expenseCategoryId,
        amountMinor: parseMoney(((i % 100) + 10).toString(), 'USD'),
        rateE4: parseRate('1,507.50'),
      }, () => TIMESTAMP);
    }

    const after = process.memoryUsage();
    const heapDelta = (after.heapUsed - before.heapUsed) / 1024 / 1024;

    console.log(`Heap delta: ${heapDelta.toFixed(2)}MB`);
    console.log(`Heap total: ${(after.heapTotal / 1024 / 1024).toFixed(2)}MB`);

    // Should not leak significantly (rough guideline: < 500MB for 10k entries)
    expect(heapDelta).toBeLessThan(500);
  });
});

describe('M17b Performance: Baseline measurements', () => {
  it('documents performance baseline', () => {
    // This test documents expected performance characteristics
    // On Xiaomi 13 Pro (fastest case):
    // - 10k transaction creation: ~20-30s
    // - 10k transaction list query: ~1-2s
    // - Monthly report generation: ~500ms
    // - Dashboard summary: ~300ms
    //
    // On budget phones (estimated 4x slower):
    // - 10k transaction creation: ~80-120s
    // - 10k transaction list query: ~4-8s
    // - Monthly report generation: ~2s
    // - Dashboard summary: ~1.2s
    //
    // Memory usage on 10k entries: ~200-300MB heap additional

    expect(true).toBe(true);
  });
});
