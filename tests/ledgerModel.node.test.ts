import fc from 'fast-check';
import Database from 'better-sqlite3';

import { calculateEntryEquivalents } from '@/domain/money';
import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import type { DbDriver } from '@/db/driver';
import { migrateDatabase } from '@/db/migrations';
import { testFixtureSql } from '@/db/sql/testFixtures.sql';

const DATE = '2026-11-18';
const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const RATE = 15_075_000n;

interface ActiveTransaction {
  id: number;
  amount: bigint;
}

describe('model-based ledger mutation sequence', () => {
  it('keeps the derived balance equal to its model with no ledger violations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            action: fc.constantFrom('create', 'edit', 'delete'),
            key: fc.integer({ min: 0, max: 4 }),
            amount: fc.bigInt({ min: 1n, max: 1_000_000_000_000n }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        async (operations) => {
          const raw = new Database(':memory:');
          const driver = BetterSqliteDriver.open(raw);
          try {
            await migrateDatabase(driver, () => TIMESTAMP);
            const accountId = await insertAccount(driver, 'Model account');
            const categoryId = await insertIncomeCategory(driver, 'Model income');
            const model = new Map<number, ActiveTransaction>();

            for (const operation of operations) {
              const active = model.get(operation.key);
              if (operation.action === 'create' && !active) {
                const id = await createIncome(driver, accountId, categoryId, operation.amount);
                model.set(operation.key, { id, amount: operation.amount });
              } else if (operation.action === 'edit' && active) {
                await editIncome(driver, active.id, operation.amount);
                model.set(operation.key, { id: active.id, amount: operation.amount });
              } else if (operation.action === 'delete' && active) {
                await driver.exclusiveTransaction((transaction) =>
                  transaction.run(testFixtureSql.deleteTransaction, { $id: active.id }),
                );
                model.delete(operation.key);
              }

              const expected = [...model.values()].reduce(
                (total, transaction) => total + transaction.amount,
                0n,
              );
              const balance = await driver.get<{ balance_minor: string }>(
                testFixtureSql.balanceForAccount,
                { $accountId: accountId },
              );
              const violations = await driver.all<{ transaction_id: number; rule: string }>(
                testFixtureSql.allLedgerViolations,
              );
              expect(balance?.balance_minor).toBe(expected.toString());
              expect(violations).toEqual([]);
            }
          } finally {
            await driver.close();
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});

async function insertAccount(driver: DbDriver, name: string): Promise<number> {
  const result = await driver.run(testFixtureSql.insertAccount, {
    $name: name,
    $type: 'cash',
    $currency: 'USD',
    $createdAt: TIMESTAMP,
    $updatedAt: TIMESTAMP,
  });
  return Number(result.lastInsertRowId);
}

async function insertIncomeCategory(driver: DbDriver, name: string): Promise<number> {
  const result = await driver.run(testFixtureSql.insertCategory, {
    $name: name,
    $kind: 'income',
    $createdAt: TIMESTAMP,
    $updatedAt: TIMESTAMP,
  });
  return Number(result.lastInsertRowId);
}

async function createIncome(
  driver: DbDriver,
  accountId: number,
  categoryId: number,
  amountMinor: bigint,
): Promise<number> {
  const equivalents = calculateEntryEquivalents(amountMinor, 'USD', RATE);
  return driver.exclusiveTransaction(async (transaction) => {
    const header = await transaction.run(testFixtureSql.insertTransaction, {
      $kind: 'income',
      $date: DATE,
      $rate: Number(RATE),
      $rateOrigin: 'manual',
      $createdAt: TIMESTAMP,
      $updatedAt: TIMESTAMP,
    });
    const id = Number(header.lastInsertRowId);
    await transaction.run(testFixtureSql.insertEntry, {
      $transactionId: id,
      $accountId: accountId,
      $categoryId: categoryId,
      $currency: 'USD',
      $amountMinor: amountMinor.toString(),
      $usdMinor: equivalents.usdMinor.toString(),
      $lbpMinor: equivalents.lbpMinor.toString(),
    });
    return id;
  });
}

async function editIncome(driver: DbDriver, id: number, amountMinor: bigint): Promise<void> {
  const equivalents = calculateEntryEquivalents(amountMinor, 'USD', RATE);
  await driver.exclusiveTransaction((transaction) =>
    transaction.run(testFixtureSql.updateEntryAmounts, {
      $transactionId: id,
      $amountMinor: amountMinor.toString(),
      $usdMinor: equivalents.usdMinor.toString(),
      $lbpMinor: equivalents.lbpMinor.toString(),
    }),
  );
}
