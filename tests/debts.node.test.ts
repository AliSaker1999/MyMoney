import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import {
  createDebt,
  deleteDebt,
  DebtServiceError,
  getDebt,
  getDebtMovements,
  listDebts,
  recordDebtMovement,
  removeDebtMovement,
  reopenDebt,
  settleDebt,
  updateDebt,
} from '@/services/debtService';
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

describe('M16 debts: create, track movements, settle', () => {
  let driver: BetterSqliteDriver;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates, reads, updates, and deletes debts', async () => {
    // CREATE
    const debtId = await createDebt(driver, {
      counterparty: 'Ali',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
      dueDate: '2026-12-01',
    }, () => TIMESTAMP);

    expect(debtId).toBeGreaterThan(0);

    // READ single
    const debt = await getDebt(driver, debtId);
    expect(debt).toMatchObject({
      id: debtId,
      counterparty: 'Ali',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
      dueDate: '2026-12-01',
      outstandingMinor: 0n,
      settledAt: null,
    });

    // READ all
    const debts = await listDebts(driver);
    expect(debts.length).toBe(1);

    // UPDATE
    await updateDebt(driver, debtId, {
      counterparty: 'Ali Saker',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
      dueDate: '2026-11-30',
    }, () => TIMESTAMP);

    const updated = await getDebt(driver, debtId);
    expect(updated?.counterparty).toBe('Ali Saker');
    expect(updated?.dueDate).toBe('2026-11-30');

    // DELETE
    await deleteDebt(driver, debtId);
    const deleted = await getDebt(driver, debtId);
    expect(deleted).toBeNull();
  });

  it('records and removes debt movements', async () => {
    const debtId = await createDebt(driver, {
      counterparty: 'Sarah',
      direction: 'owed_to_me',
      currency: 'USD',
      startDate: '2026-11-01',
    }, () => TIMESTAMP);

    // Initial state
    let debt = await getDebt(driver, debtId);
    expect(debt?.outstandingMinor).toBe(0n);

    // Record first movement (Sarah owes me $100)
    const mov1 = await recordDebtMovement(driver, {
      debtId,
      date: '2026-11-01',
      amountMinor: parseMoney('100', 'USD'),
    }, () => TIMESTAMP);

    debt = await getDebt(driver, debtId);
    expect(debt?.outstandingMinor).toBe(10_000n);

    // Record second movement (Sarah pays $30)
    const mov2 = await recordDebtMovement(driver, {
      debtId,
      date: '2026-11-15',
      amountMinor: parseMoney('-30', 'USD'),
    }, () => TIMESTAMP);

    debt = await getDebt(driver, debtId);
    expect(debt?.outstandingMinor).toBe(7_000n);

    // Get movements
    const movements = await getDebtMovements(driver, debtId);
    expect(movements).toHaveLength(2);

    // Remove a movement
    await removeDebtMovement(driver, mov2);
    debt = await getDebt(driver, debtId);
    expect(debt?.outstandingMinor).toBe(10_000n);
  });

  it('settles and reopens debts', async () => {
    const debtId = await createDebt(driver, {
      counterparty: 'Mom',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-01-01',
    }, () => TIMESTAMP);

    let debt = await getDebt(driver, debtId);
    expect(debt?.settledAt).toBeNull();

    // Settle
    await settleDebt(driver, debtId, () => TIMESTAMP);
    debt = await getDebt(driver, debtId);
    expect(debt?.settledAt).toBe(TIMESTAMP);

    // Reopen
    await reopenDebt(driver, debtId, () => TIMESTAMP);
    debt = await getDebt(driver, debtId);
    expect(debt?.settledAt).toBeNull();
  });

  it('allows different directions and currencies', async () => {
    const iOweId = await createDebt(driver, {
      counterparty: 'Bank',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
    }, () => TIMESTAMP);

    const owedId = await createDebt(driver, {
      counterparty: 'Client',
      direction: 'owed_to_me',
      currency: 'LBP',
      startDate: '2026-11-01',
    }, () => TIMESTAMP);

    const debts = await listDebts(driver);
    expect(debts).toHaveLength(2);

    const iOwe = debts.find((d) => d.id === iOweId);
    const owed = debts.find((d) => d.id === owedId);

    expect(iOwe?.direction).toBe('i_owe');
    expect(iOwe?.currency).toBe('USD');
    expect(owed?.direction).toBe('owed_to_me');
    expect(owed?.currency).toBe('LBP');
  });

  it('validates debt input', async () => {
    // Empty counterparty
    await expect(
      createDebt(driver, {
        counterparty: '',
        direction: 'i_owe',
        currency: 'USD',
        startDate: '2026-11-01',
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);

    // Invalid direction
    await expect(
      createDebt(driver, {
        counterparty: 'John',
        direction: 'invalid' as any,
        currency: 'USD',
        startDate: '2026-11-01',
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);

    // Invalid currency
    await expect(
      createDebt(driver, {
        counterparty: 'John',
        direction: 'i_owe',
        currency: 'EUR' as any,
        startDate: '2026-11-01',
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);

    // Invalid date
    await expect(
      createDebt(driver, {
        counterparty: 'John',
        direction: 'i_owe',
        currency: 'USD',
        startDate: 'invalid-date',
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);
  });

  it('filters by settled status in list', async () => {
    const active = await createDebt(driver, {
      counterparty: 'Active debt',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
    }, () => TIMESTAMP);

    const settled = await createDebt(driver, {
      counterparty: 'Settled debt',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
    }, () => TIMESTAMP);

    // Settle one debt
    await settleDebt(driver, settled, () => TIMESTAMP);

    const all = await listDebts(driver);
    expect(all).toHaveLength(2);

    // Active should come first
    expect(all[0]?.id).toBe(active);
    expect(all[1]?.id).toBe(settled);
  });

  it('validates movement input', async () => {
    const debtId = await createDebt(driver, {
      counterparty: 'Test',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-11-01',
    }, () => TIMESTAMP);

    // Invalid date
    await expect(
      recordDebtMovement(driver, {
        debtId,
        date: 'invalid',
        amountMinor: parseMoney('100', 'USD'),
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);

    // Zero amount
    await expect(
      recordDebtMovement(driver, {
        debtId,
        date: '2026-11-01',
        amountMinor: 0n,
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);

    // Invalid debt ID
    await expect(
      recordDebtMovement(driver, {
        debtId: -1,
        date: '2026-11-01',
        amountMinor: parseMoney('100', 'USD'),
      }, () => TIMESTAMP)
    ).rejects.toThrow(DebtServiceError);
  });

  it('calculates outstanding correctly with multiple movements', async () => {
    const debtId = await createDebt(driver, {
      counterparty: 'Complex debt',
      direction: 'i_owe',
      currency: 'USD',
      startDate: '2026-01-01',
    }, () => TIMESTAMP);

    // Borrow $1000
    await recordDebtMovement(driver, {
      debtId,
      date: '2026-01-01',
      amountMinor: parseMoney('1000', 'USD'),
    }, () => TIMESTAMP);

    // Pay $300
    await recordDebtMovement(driver, {
      debtId,
      date: '2026-02-01',
      amountMinor: parseMoney('-300', 'USD'),
    }, () => TIMESTAMP);

    // Borrow $200 more
    await recordDebtMovement(driver, {
      debtId,
      date: '2026-03-01',
      amountMinor: parseMoney('200', 'USD'),
    }, () => TIMESTAMP);

    const debt = await getDebt(driver, debtId);
    // 1000 - 300 + 200 = 900
    expect(debt?.outstandingMinor).toBe(90_000n);
  });
});
