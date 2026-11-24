import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import { exportEncryptedBackup, decryptBackupSnapshot } from '@/services/backupService';
import { restoreBackupSnapshot } from '@/services/restoreService';
import { getReportSnapshot } from '@/services/reportService';
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

describe('M12-M13 restore and reports', () => {
  let source: BetterSqliteDriver;
  let target: BetterSqliteDriver;

  beforeEach(async () => {
    source = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(source);
    await completeOnboarding(source, onboardingInput, () => TIMESTAMP);
    target = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(target);
  });

  afterEach(async () => {
    await source.close();
    await target.close();
  });

  it('decrypts and atomically restores a validated backup snapshot', async () => {
    const account = (await listAccounts(source))[0]!;
    const category = (await listCategories(source)).find((item) => item.builtinKey === 'category.expense.food')!;
    await createTransaction(source, {
      kind: 'expense',
      date: '2026-11-18',
      accountId: account.id,
      categoryId: category.id,
      amountMinor: parseMoney('20', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    const envelope = await exportEncryptedBackup(
      source,
      'twelve-character-password',
      '0.1.0',
      undefined,
      () => TIMESTAMP,
    );
    const snapshot = await decryptBackupSnapshot(envelope, 'twelve-character-password');
    await restoreBackupSnapshot(target, snapshot);

    await expect(listAccounts(target)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Cash' })]),
    );
    await expect(target.get<{ count: number }>(
      'SELECT count(*) AS count FROM transactions',
    )).resolves.toEqual({ count: 1 });
  });

  it('rejects the wrong restore password', async () => {
    const envelope = await exportEncryptedBackup(
      source,
      'twelve-character-password',
      '0.1.0',
      undefined,
      () => TIMESTAMP,
    );
    await expect(decryptBackupSnapshot(envelope, 'wrong-password')).rejects.toThrow();
  });

  it('builds monthly cash-flow, category, and native net-worth reports', async () => {
    const account = (await listAccounts(source))[0]!;
    const category = (await listCategories(source)).find((item) => item.builtinKey === 'category.expense.food')!;
    await createTransaction(source, {
      kind: 'expense',
      date: '2026-11-18',
      accountId: account.id,
      categoryId: category.id,
      amountMinor: parseMoney('20', 'USD'),
      rateE4: parseRate('1,507.50'),
    }, () => TIMESTAMP);

    const report = await getReportSnapshot(source, '2026-11-01', '2026-11-30');
    expect(report.cashFlow).toEqual([
      expect.objectContaining({
        month: '2026-11',
        expenseUsdMinor: 2_000n,
      }),
    ]);
    expect(report.categoryBreakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({
        label: 'category.expense.food',
        usdMinor: -2_000n,
      })]),
    );
    expect(report.netWorthNative).toEqual(
      expect.arrayContaining([expect.objectContaining({
        currency: 'USD',
        balanceMinor: -2_000n,
      })]),
    );
  });
});
