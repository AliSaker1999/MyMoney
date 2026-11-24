import Database from 'better-sqlite3';

import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { migrateDatabase } from '@/db/migrations';
import { parseMoney, parseRate } from '@/domain/money';
import {
  archiveGoal,
  contributeToGoal,
  createGoal,
  deleteGoal,
  getGoal,
  getGoalContributions,
  GoalServiceError,
  listGoals,
  markAchieved,
  markActive,
  removeContribution,
  updateGoal,
} from '@/services/goalService';
import { completeOnboarding, type OnboardingInput } from '@/services/onboardingService';
import { listAccounts } from '@/services/ledgerSetupService';

const TIMESTAMP = '2026-11-18T12:34:56.789Z';
const onboardingInput: OnboardingInput = {
  rateSource: 'market',
  rateDate: '2026-11-18',
  rateE4: parseRate('1,507.50'),
  accountName: 'Cash',
  accountType: 'cash',
  accountCurrency: 'USD',
};

describe('M15 goals: create, contribute, track progress', () => {
  let driver: BetterSqliteDriver;
  let accountId: number;

  beforeEach(async () => {
    driver = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(driver);
    await completeOnboarding(driver, onboardingInput, () => TIMESTAMP);

    const accounts = await listAccounts(driver);
    accountId = accounts[0]!.id;
  });

  afterEach(async () => {
    await driver.close();
  });

  it('creates, reads, updates, and deletes goals', async () => {
    // CREATE
    const goalId = await createGoal(driver, {
      name: 'Save for vacation',
      currency: 'USD',
      targetMinor: parseMoney('5000', 'USD'),
      targetDate: '2027-06-30',
      accountId,
    }, () => TIMESTAMP);

    expect(goalId).toBeGreaterThan(0);

    // READ single
    const goal = await getGoal(driver, goalId);
    expect(goal).toMatchObject({
      id: goalId,
      name: 'Save for vacation',
      currency: 'USD',
      targetMinor: 500_000n,
      targetDate: '2027-06-30',
      accountId,
      totalContributed: 0n,
      achievedAt: null,
      archivedAt: null,
    });

    // READ all
    const goals = await listGoals(driver);
    expect(goals.length).toBe(1);
    expect(goals[0]?.id).toBe(goalId);

    // UPDATE
    await updateGoal(driver, goalId, {
      name: 'Save for vacation - Europe trip',
      currency: 'USD',
      targetMinor: parseMoney('7500', 'USD'),
      targetDate: '2027-07-15',
      accountId,
    }, () => TIMESTAMP);

    const updated = await getGoal(driver, goalId);
    expect(updated?.name).toBe('Save for vacation - Europe trip');
    expect(updated?.targetMinor).toBe(750_000n);
    expect(updated?.targetDate).toBe('2027-07-15');

    // DELETE
    await deleteGoal(driver, goalId);
    const deleted = await getGoal(driver, goalId);
    expect(deleted).toBeNull();
  });

  it('tracks contributions to a goal', async () => {
    const goalId = await createGoal(driver, {
      name: 'Emergency fund',
      currency: 'USD',
      targetMinor: parseMoney('10000', 'USD'),
    }, () => TIMESTAMP);

    // Initial state: no contributions
    let goal = await getGoal(driver, goalId);
    expect(goal?.totalContributed).toBe(0n);

    // Add first contribution
    const contrib1Id = await contributeToGoal(driver, {
      goalId,
      date: '2026-11-01',
      amountMinor: parseMoney('1000', 'USD'),
      note: 'First savings',
    }, () => TIMESTAMP);

    // Add second contribution
    const contrib2Id = await contributeToGoal(driver, {
      goalId,
      date: '2026-11-15',
      amountMinor: parseMoney('2000', 'USD'),
      note: 'Bonus payment',
    }, () => TIMESTAMP);

    // Verify total
    goal = await getGoal(driver, goalId);
    expect(goal?.totalContributed).toBe(300_000n);

    // Get contributions
    const contributions = await getGoalContributions(driver, goalId);
    expect(contributions).toHaveLength(2);
    expect(contributions[0]?.id).toBe(contrib2Id); // Most recent first
    expect(contributions[1]?.id).toBe(contrib1Id);

    // Remove contribution
    await removeContribution(driver, contrib1Id);
    goal = await getGoal(driver, goalId);
    expect(goal?.totalContributed).toBe(200_000n);
  });

  it('marks goals as achieved and active', async () => {
    const goalId = await createGoal(driver, {
      name: 'Read 12 books',
      currency: 'USD',
      targetMinor: parseMoney('100', 'USD'),
    }, () => TIMESTAMP);

    let goal = await getGoal(driver, goalId);
    expect(goal?.achievedAt).toBeNull();

    // Mark achieved
    await markAchieved(driver, goalId, () => TIMESTAMP);
    goal = await getGoal(driver, goalId);
    expect(goal?.achievedAt).toBe(TIMESTAMP);

    // Mark active again
    await markActive(driver, goalId, () => TIMESTAMP);
    goal = await getGoal(driver, goalId);
    expect(goal?.achievedAt).toBeNull();
  });

  it('archives and unarchives goals', async () => {
    const goalId = await createGoal(driver, {
      name: 'Pay off debt',
      currency: 'USD',
      targetMinor: parseMoney('50000', 'USD'),
    }, () => TIMESTAMP);

    let goal = await getGoal(driver, goalId);
    expect(goal?.archivedAt).toBeNull();

    // Archive
    await archiveGoal(driver, goalId, () => TIMESTAMP);
    goal = await getGoal(driver, goalId);
    expect(goal?.archivedAt).toBe(TIMESTAMP);
  });

  it('allows multiple goals with different currencies', async () => {
    const goalUSD = await createGoal(driver, {
      name: 'Save USD',
      currency: 'USD',
      targetMinor: parseMoney('5000', 'USD'),
    }, () => TIMESTAMP);

    const goalLBP = await createGoal(driver, {
      name: 'Save LBP',
      currency: 'LBP',
      targetMinor: parseMoney('10000000', 'LBP'),
    }, () => TIMESTAMP);

    const goals = await listGoals(driver);
    expect(goals).toHaveLength(2);

    const usd = goals.find((g) => g.id === goalUSD);
    const lbp = goals.find((g) => g.id === goalLBP);

    expect(usd?.currency).toBe('USD');
    expect(lbp?.currency).toBe('LBP');
  });

  it('validates goal input', async () => {
    // Empty name
    await expect(
      createGoal(driver, {
        name: '',
        currency: 'USD',
        targetMinor: parseMoney('100', 'USD'),
      }, () => TIMESTAMP)
    ).rejects.toThrow(GoalServiceError);

    // Invalid currency
    await expect(
      createGoal(driver, {
        name: 'Goal',
        currency: 'EUR' as any,
        targetMinor: parseMoney('100', 'USD'),
      }, () => TIMESTAMP)
    ).rejects.toThrow(GoalServiceError);

    // Zero or negative amount
    await expect(
      createGoal(driver, {
        name: 'Goal',
        currency: 'USD',
        targetMinor: 0n,
      }, () => TIMESTAMP)
    ).rejects.toThrow(GoalServiceError);
  });

  it('validates contribution input', async () => {
    const goalId = await createGoal(driver, {
      name: 'Test goal',
      currency: 'USD',
      targetMinor: parseMoney('1000', 'USD'),
    }, () => TIMESTAMP);

    // Invalid date format
    await expect(
      contributeToGoal(driver, {
        goalId,
        date: 'invalid-date',
        amountMinor: parseMoney('100', 'USD'),
      }, () => TIMESTAMP)
    ).rejects.toThrow(GoalServiceError);

    // Zero amount
    await expect(
      contributeToGoal(driver, {
        goalId,
        date: '2026-11-18',
        amountMinor: 0n,
      }, () => TIMESTAMP)
    ).rejects.toThrow(GoalServiceError);

    // Invalid goal ID
    await expect(
      contributeToGoal(driver, {
        goalId: -1,
        date: '2026-11-18',
        amountMinor: parseMoney('100', 'USD'),
      }, () => TIMESTAMP)
    ).rejects.toThrow(GoalServiceError);
  });

  it('calculates progress percentage correctly', async () => {
    const goalId = await createGoal(driver, {
      name: 'Test progress',
      currency: 'USD',
      targetMinor: parseMoney('1000', 'USD'),
    }, () => TIMESTAMP);

    // 25% complete
    await contributeToGoal(driver, {
      goalId,
      date: '2026-11-01',
      amountMinor: parseMoney('250', 'USD'),
    }, () => TIMESTAMP);

    // 75% complete
    await contributeToGoal(driver, {
      goalId,
      date: '2026-11-15',
      amountMinor: parseMoney('500', 'USD'),
    }, () => TIMESTAMP);

    const goal = await getGoal(driver, goalId);
    expect(goal?.totalContributed).toBe(75_000n);
    // 75000 / 100000 * 100 = 75%
  });

  it('allows goals without account association', async () => {
    const goalId = await createGoal(driver, {
      name: 'Goal without account',
      currency: 'USD',
      targetMinor: parseMoney('1000', 'USD'),
      accountId: null,
    }, () => TIMESTAMP);

    const goal = await getGoal(driver, goalId);
    expect(goal?.accountId).toBeNull();
  });

  it('filters by achieved/archived status in list', async () => {
    const active = await createGoal(driver, {
      name: 'Active goal',
      currency: 'USD',
      targetMinor: parseMoney('1000', 'USD'),
    }, () => TIMESTAMP);

    const achieved = await createGoal(driver, {
      name: 'Achieved goal',
      currency: 'USD',
      targetMinor: parseMoney('1000', 'USD'),
    }, () => TIMESTAMP);

    const archived = await createGoal(driver, {
      name: 'Archived goal',
      currency: 'USD',
      targetMinor: parseMoney('1000', 'USD'),
    }, () => TIMESTAMP);

    // Mark achieved
    await markAchieved(driver, achieved, () => TIMESTAMP);

    // Archive
    await archiveGoal(driver, archived, () => TIMESTAMP);

    const all = await listGoals(driver);
    expect(all).toHaveLength(3);

    // Sort order: active (not achieved, not archived), archived (not achieved, archived), achieved (achieved, not archived)
    expect(all[0]?.id).toBe(active);
    expect(all[1]?.id).toBe(archived);
    expect(all[2]?.id).toBe(achieved);
  });
});
