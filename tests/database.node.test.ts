import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase, MigrationError } from '@/db/migrations';
import { migrationSql } from '@/db/sql/migrations.sql';
import { testFixtureSql } from '@/db/sql/testFixtures.sql';

const DATE = '2026-11-18';
const TIMESTAMP = '2026-11-18T12:34:56.789Z';

describe('M2 database foundation', () => {
  let raw: Database.Database;
  let driver: BetterSqliteDriver;

  beforeEach(() => {
    raw = new Database(':memory:');
    driver = BetterSqliteDriver.open(raw);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('applies schema v1 once with a stable migration record and checksum', async () => {
    await migrateDatabase(driver, () => TIMESTAMP);
    await migrateDatabase(driver, () => TIMESTAMP);

    await expect(driver.get<{ user_version: number }>(migrationSql.userVersion)).resolves.toEqual({
      user_version: 1,
    });
    await expect(driver.get<{ count: number }>(testFixtureSql.migrationCount)).resolves.toEqual({
      count: 1,
    });
    await expect(driver.all<{ name: string }>(testFixtureSql.databaseObjects)).resolves.toEqual([
        { name: 'v_account_balances' },
        { name: 'v_categorized_flows' },
        { name: 'v_debt_outstanding' },
        { name: 'v_ledger_violations' },
      ]);
  });

  it('rejects a changed applied migration and a database from a newer schema', async () => {
    await migrateDatabase(driver, () => TIMESTAMP);
    await driver.run(testFixtureSql.changeMigrationChecksum, {
      $version: 1,
      $checksum: 'changed',
    });
    await expect(migrateDatabase(driver)).rejects.toThrow(MigrationError);

    const newRaw = new Database(':memory:');
    const newerDriver = BetterSqliteDriver.open(newRaw);
    try {
      await newerDriver.exec(testFixtureSql.setFutureUserVersion);
      await expect(migrateDatabase(newerDriver)).rejects.toThrow(/newer than this app supports/);
    } finally {
      await newerDriver.close();
    }
  });

  it('rolls back all statements when an exclusive transaction fails', async () => {
    await migrateDatabase(driver, () => TIMESTAMP);
    await expect(
      driver.exclusiveTransaction(async (transaction) => {
        await transaction.run(testFixtureSql.insertRateSource, {
          $code: 'market',
          $isBuiltin: 1,
          $createdAt: TIMESTAMP,
        });
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');

    await expect(driver.get<{ count: number }>(testFixtureSql.rateSourceCount)).resolves.toEqual({
      count: 0,
    });
  });

  it('enforces date, foreign-key, category, account-currency, and transaction-kind invariants', async () => {
    await migrateDatabase(driver, () => TIMESTAMP);
    const accountId = await insertAccount(driver, 'Cash', 'USD');
    const categoryId = await insertCategory(driver, 'Salary', 'income');
    const transactionId = await insertTransaction(driver, 'income');

    await expect(
      driver.run(testFixtureSql.insertEntry, {
        $transactionId: transactionId,
        $accountId: accountId,
        $categoryId: categoryId,
        $currency: 'USD',
        $amountMinor: 1.5,
        $usdMinor: 1.5,
        $lbpMinor: 2,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    await expect(
      driver.run(testFixtureSql.insertEntry, {
        $transactionId: transactionId,
        $accountId: accountId,
        $categoryId: await insertCategory(driver, 'Wrong kind', 'expense'),
        $currency: 'USD',
        $amountMinor: 100,
        $usdMinor: 100,
        $lbpMinor: 1_508,
      }),
    ).rejects.toThrow(/entry category kind or sign mismatch/);

    await expect(
      driver.run(testFixtureSql.insertExchangeRate, {
        $sourceId: 999,
        $effectiveDate: DATE,
        $effectiveSeq: 0,
        $rate: 15_075_000,
        $createdAt: TIMESTAMP,
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    await driver.run(testFixtureSql.insertEntry, {
      $transactionId: transactionId,
      $accountId: accountId,
      $categoryId: categoryId,
      $currency: 'USD',
      $amountMinor: 100,
      $usdMinor: 100,
      $lbpMinor: 1_508,
    });
    await expect(
      driver.run(testFixtureSql.updateAccountCurrency, { $id: accountId, $currency: 'LBP' }),
    ).rejects.toThrow(/account currency cannot change/);
    await expect(
      driver.run(testFixtureSql.updateTransactionKind, { $id: transactionId, $kind: 'expense' }),
    ).rejects.toThrow(/transaction kind is immutable/);
    await driver.run(testFixtureSql.insertRateSource, {
      $code: 'market',
      $isBuiltin: 1,
      $createdAt: TIMESTAMP,
    });
    await expect(
      driver.run(testFixtureSql.insertExchangeRate, {
        $sourceId: 1,
        $effectiveDate: '2026-02-30',
        $effectiveSeq: 0,
        $rate: 15_075_000,
        $createdAt: TIMESTAMP,
      }),
    ).rejects.toThrow();
    await expect(
      driver.run(testFixtureSql.insertExchangeRate, {
        $sourceId: 1,
        $effectiveDate: DATE,
        $effectiveSeq: 0,
        $rate: 15_075_000.5,
        $createdAt: TIMESTAMP,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('derives balances and categorized flows from entries, and reports malformed ledgers', async () => {
    await migrateDatabase(driver, () => TIMESTAMP);
    const accountId = await insertAccount(driver, 'Wallet', 'USD');
    const categoryId = await insertCategory(driver, 'Food', 'expense');
    const incomeId = await insertTransaction(driver, 'income');
    const expenseId = await insertTransaction(driver, 'expense');
    const malformedId = await insertTransaction(driver, 'refund');

    await driver.run(testFixtureSql.insertEntry, {
      $transactionId: incomeId,
      $accountId: accountId,
      $categoryId: await insertCategory(driver, 'Wages', 'income'),
      $currency: 'USD',
      $amountMinor: 20_000,
      $usdMinor: 20_000,
      $lbpMinor: 301_500,
    });
    await driver.run(testFixtureSql.insertEntry, {
      $transactionId: expenseId,
      $accountId: accountId,
      $categoryId: categoryId,
      $currency: 'USD',
      $amountMinor: -2_500,
      $usdMinor: -2_500,
      $lbpMinor: -37_688,
    });

    await expect(driver.get<{ balance_minor: string }>(testFixtureSql.balanceForAccount, {
      $accountId: accountId,
    })).resolves.toEqual({ balance_minor: '17500' });
    await expect(driver.get<{ count: number }>(testFixtureSql.flowCount, {
      $transactionId: incomeId,
    })).resolves.toEqual({ count: 1 });
    await expect(driver.get<{ count: number }>(testFixtureSql.flowCount, {
      $transactionId: malformedId,
    })).resolves.toEqual({ count: 0 });
    await expect(driver.all<{ rule: string }>(testFixtureSql.violationsForTransaction, {
      $transactionId: malformedId,
    })).resolves.toEqual([{ rule: 'flow_entry_rules' }]);
  });

    it('checks transfer balance and linked transfer-fee rules', async () => {
      await migrateDatabase(driver, () => TIMESTAMP);
      const sourceId = await insertAccount(driver, 'Source', 'USD');
      const destinationId = await insertAccount(driver, 'Destination', 'USD');
      const expenseCategoryId = await insertCategory(driver, 'Fees', 'expense');
      const transferId = await insertTransaction(driver, 'transfer');
      await insertEntry(driver, transferId, sourceId, null, 'USD', -10_000, -10_000, -150_750);
      await insertEntry(driver, transferId, destinationId, null, 'USD', 10_000, 10_000, 150_750);

      await expect(driver.all<{ rule: string }>(testFixtureSql.violationsForTransaction, {
        $transactionId: transferId,
      })).resolves.toEqual([]);

      const feeId = await insertLinkedTransaction(driver, transferId, 'transfer_fee');
      await insertEntry(driver, feeId, sourceId, expenseCategoryId, 'USD', -250, -250, -3_769);
      await expect(driver.all<{ rule: string }>(testFixtureSql.violationsForTransaction, {
        $transactionId: feeId,
      })).resolves.toEqual([]);
      await expect(driver.get<{ count: number }>(testFixtureSql.flowCount, {
        $transactionId: transferId,
      })).resolves.toEqual({ count: 0 });
      await expect(driver.get<{ count: number }>(testFixtureSql.flowCount, {
        $transactionId: feeId,
      })).resolves.toEqual({ count: 1 });
      await expect(insertLinkedTransaction(driver, transferId, 'transfer_fee')).rejects.toThrow();

      const badTransferId = await insertTransaction(driver, 'transfer');
      await insertEntry(driver, badTransferId, sourceId, null, 'USD', -10_000, -10_000, -150_750);
      await insertEntry(driver, badTransferId, destinationId, null, 'USD', 9_999, 9_999, 150_735);
      await expect(driver.all<{ rule: string }>(testFixtureSql.violationsForTransaction, {
        $transactionId: badTransferId,
      })).resolves.toEqual([{ rule: 'transfer_entry_rules' }]);
    });

    it('validates debt movements and derives outstanding amounts', async () => {
      await migrateDatabase(driver, () => TIMESTAMP);
      const accountId = await insertAccount(driver, 'Checking', 'USD');
      const debtResult = await driver.run(testFixtureSql.insertDebt, {
        $counterparty: 'Alex',
        $direction: 'i_owe',
        $currency: 'USD',
        $date: DATE,
        $createdAt: TIMESTAMP,
        $updatedAt: TIMESTAMP,
      });
      const debtId = Number(debtResult.lastInsertRowId);
      const debtTransactionId = await insertTransaction(driver, 'debt');
      await insertEntry(driver, debtTransactionId, accountId, null, 'USD', 5_000, 5_000, 75_375);
      await driver.run(testFixtureSql.insertDebtMovement, {
        $debtId: debtId,
        $transactionId: debtTransactionId,
        $date: DATE,
        $amountMinor: 5_000,
        $createdAt: TIMESTAMP,
      });

      await expect(driver.all<{ rule: string }>(testFixtureSql.violationsForTransaction, {
        $transactionId: debtTransactionId,
      })).resolves.toEqual([]);
      await expect(driver.get<{ outstanding_minor: string }>(testFixtureSql.debtOutstanding, {
        $debtId: debtId,
      })).resolves.toEqual({ outstanding_minor: '5000' });
    });

  it('accepts canonical UTC timestamps and rejects malformed timestamps', async () => {
    await migrateDatabase(driver, () => TIMESTAMP);
    await insertAccount(driver, 'Valid', 'LBP');
    await expect(
      driver.run(testFixtureSql.insertAccount, {
        $name: 'Invalid timestamp',
        $type: 'cash',
        $currency: 'LBP',
        $createdAt: '2026-11-18 12:34:56',
        $updatedAt: TIMESTAMP,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

async function insertAccount(driver: DbDriverLike, name: string, currency: string): Promise<number> {
  const result = await driver.run(testFixtureSql.insertAccount, {
    $name: name,
    $type: 'cash',
    $currency: currency,
    $createdAt: TIMESTAMP,
    $updatedAt: TIMESTAMP,
  });
  return Number(result.lastInsertRowId);
}

async function insertCategory(driver: DbDriverLike, name: string, kind: string): Promise<number> {
  const result = await driver.run(testFixtureSql.insertCategory, {
    $name: name,
    $kind: kind,
    $createdAt: TIMESTAMP,
    $updatedAt: TIMESTAMP,
  });
  return Number(result.lastInsertRowId);
}

async function insertTransaction(driver: DbDriverLike, kind: string): Promise<number> {
  const result = await driver.run(testFixtureSql.insertTransaction, {
    $kind: kind,
    $date: DATE,
    $rate: 15_075_000,
    $rateOrigin: 'manual',
    $createdAt: TIMESTAMP,
    $updatedAt: TIMESTAMP,
  });
  return Number(result.lastInsertRowId);
}

async function insertLinkedTransaction(
  driver: DbDriverLike,
  parentId: number,
  linkType: 'transfer_fee' | 'debt_interest',
): Promise<number> {
  const result = await driver.run(testFixtureSql.insertLinkedTransaction, {
    $kind: 'expense',
    $date: DATE,
    $rate: 15_075_000,
    $rateOrigin: 'inherited',
    $parentId: parentId,
    $linkType: linkType,
    $createdAt: TIMESTAMP,
    $updatedAt: TIMESTAMP,
  });
  return Number(result.lastInsertRowId);
}

async function insertEntry(
  driver: DbDriverLike,
  transactionId: number,
  accountId: number,
  categoryId: number | null,
  currency: 'USD' | 'LBP',
  amountMinor: number,
  usdMinor: number,
  lbpMinor: number,
): Promise<void> {
  await driver.run(testFixtureSql.insertEntry, {
    $transactionId: transactionId,
    $accountId: accountId,
    $categoryId: categoryId,
    $currency: currency,
    $amountMinor: amountMinor,
    $usdMinor: usdMinor,
    $lbpMinor: lbpMinor,
  });
}

type DbDriverLike = Pick<BetterSqliteDriver, 'run' | 'all' | 'get'>;
