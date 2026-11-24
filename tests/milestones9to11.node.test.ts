import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import {
  createTransfer,
  deleteTransfer,
  getTransaction,
  updateTransfer,
} from '@/services/ledgerService';
import { getDashboard, getAccountLedger, runDataHealth } from '@/services/dashboardService';
import { createBackupSnapshot, exportEncryptedBackup, validateBackupHeader } from '@/services/backupService';
import { completeOnboarding, type OnboardingInput } from '@/services/onboardingService';
import { createAccount, listAccounts, listCategories } from '@/services/ledgerSetupService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const onboardingInput: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: 'Cash USD',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M9-M11 transfers, dashboard, and backup', () => {
  let driver: BetterSqliteDriver;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates balanced cross-currency transfers and linked fees', async () => {
    const usd = (await listAccounts(driver))[0]!;
    const lbp = await createAccount(driver, {
      name: 'Cash LBP',
      type: 'cash',
      currency: 'LBP',
    }, () => TIMESTAMP);
    const expenseCategory = (await listCategories(driver)).find((category) => category.builtinKey === 'category.expense.food')!;

    const transferId = await createTransfer(driver, {
      date: '2026-11-18',
      source: { accountId: usd.id, amountMinor: parseMoney('100', 'USD') },
      destination: { accountId: lbp, amountMinor: 0n },
      rateE4: parseRate('1,507.50'),
      feeAccountId: usd.id,
      feeCategoryId: expenseCategory.id,
      feeAmountMinor: parseMoney('2', 'USD'),
    }, () => TIMESTAMP);

    await expect(getTransaction(driver, transferId)).resolves.toMatchObject({
      kind: 'transfer',
      entries: expect.arrayContaining([
        expect.objectContaining({ amountMinor: -10_000n, currency: 'USD' }),
        expect.objectContaining({ amountMinor: 150_750n, currency: 'LBP' }),
      ]),
    });
    await expect(driver.get<{ count: number }>(
      `SELECT count(*) AS count FROM transactions WHERE parent_transaction_id = ${transferId} AND link_type = 'transfer_fee'`,
    )).resolves.toEqual({ count: 1 });

    await updateTransfer(driver, transferId, {
      date: '2026-11-19',
      source: { accountId: usd.id, amountMinor: parseMoney('80', 'USD') },
      destination: { accountId: lbp, amountMinor: 0n },
      rateE4: parseRate('1,600'),
    }, () => TIMESTAMP);
    await expect(getTransaction(driver, transferId)).resolves.toMatchObject({
      date: '2026-11-19',
      entries: expect.arrayContaining([
        expect.objectContaining({ amountMinor: -8_000n, currency: 'USD' }),
      ]),
    });

    await deleteTransfer(driver, transferId, true);
    await expect(getTransaction(driver, transferId)).resolves.toBeNull();
  });

  it('reports dashboard balances, account ledgers, and healthy data', async () => {
    const account = (await listAccounts(driver))[0]!;
    const dashboard = await getDashboard(driver, '2026-11-01', '2026-11-30');
    expect(dashboard.balances).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: account.id, name: 'Cash USD' })]),
    );
    await expect(getAccountLedger(driver, account.id)).resolves.toEqual([]);
    await expect(runDataHealth(driver)).resolves.toEqual([]);
  });

  it('creates a v1 snapshot and encrypted export envelope', async () => {
    const snapshot = await createBackupSnapshot(driver);
    expect(snapshot.manifest.schemaVersion).toBe(1);
    expect(snapshot.manifest.rowCounts.accounts).toBe(1);

    const envelope = await exportEncryptedBackup(
      driver,
      'twelve-character-password',
      '0.1.0',
      undefined,
      () => TIMESTAMP,
    );
    expect(envelope.format).toBe('mymoney-backup');
    expect(envelope.formatVersion).toBe(1);
    expect(envelope.cipher.tagLength).toBe(16);
    expect(() => validateBackupHeader(envelope)).not.toThrow();
  });
});
