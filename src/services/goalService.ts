import type { DbDriver } from '@/db/driver';
import { goalsSql } from '@/db/sql/goals.sql';
import type { Currency } from '@/domain/money';

export interface Goal {
  id: number;
  name: string;
  currency: Currency;
  targetMinor: bigint;
  targetDate: string | null;
  accountId: number | null;
  totalContributed: bigint;
  achievedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalContribution {
  id: number;
  goalId: number;
  date: string;
  amountMinor: bigint;
  note: string | null;
  createdAt: string;
}

export interface GoalInput {
  name: string;
  currency: Currency;
  targetMinor: bigint;
  targetDate?: string | null;
  accountId?: number | null;
}

export interface ContributionInput {
  goalId: number;
  date: string;
  amountMinor: bigint;
  note?: string | null;
}

export class GoalServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoalServiceError';
  }
}

interface GoalRow {
  id: number;
  name: string;
  currency: Currency;
  target_minor: string;
  target_date: string | null;
  account_id: number | null;
  total_contributed: string;
  achieved_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ContributionRow {
  id: number;
  goal_id: number;
  date: string;
  amount_minor: string;
  note: string | null;
  created_at: string;
}

interface IdRow {
  id: number;
}

export async function listGoals(database: DbDriver): Promise<Goal[]> {
  const rows = await database.all<GoalRow>(goalsSql.listGoals);
  return rows.map(mapGoal);
}

export async function getGoal(database: DbDriver, goalId: number): Promise<Goal | null> {
  const row = await database.get<GoalRow>(goalsSql.getGoal, { $id: goalId });
  return row ? mapGoal(row) : null;
}

export async function getGoalContributions(
  database: DbDriver,
  goalId: number,
): Promise<GoalContribution[]> {
  const rows = await database.all<ContributionRow>(goalsSql.getGoalContributions, {
    $goalId: goalId,
  });
  return rows.map(mapContribution);
}

export async function createGoal(
  database: DbDriver,
  input: GoalInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateGoalInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    if (input.accountId !== null && input.accountId !== undefined) {
      await validateAccountExists(transaction, input.accountId);
    }
    const result = await transaction.run(goalsSql.insertGoal, {
      $name: input.name,
      $currency: input.currency,
      $targetMinor: Number(input.targetMinor),
      $targetDate: input.targetDate ?? null,
      $accountId: input.accountId ?? null,
      $createdAt: now(),
      $updatedAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function updateGoal(
  database: DbDriver,
  goalId: number,
  input: GoalInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateGoalInput(input);
  await database.exclusiveTransaction(async (transaction) => {
    const goal = await getGoal(transaction, goalId);
    if (!goal) throw new GoalServiceError('The goal is unavailable.');

    if (input.accountId !== null && input.accountId !== undefined) {
      await validateAccountExists(transaction, input.accountId);
    }

    const result = await transaction.run(goalsSql.updateGoal, {
      $id: goalId,
      $name: input.name,
      $targetMinor: Number(input.targetMinor),
      $targetDate: input.targetDate ?? null,
      $accountId: input.accountId ?? null,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new GoalServiceError('The goal was not updated.');
  });
}

export async function deleteGoal(database: DbDriver, goalId: number): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const goal = await getGoal(transaction, goalId);
    if (!goal) throw new GoalServiceError('The goal is unavailable.');
    const result = await transaction.run(goalsSql.deleteGoal, { $id: goalId });
    if (result.changes !== 1) throw new GoalServiceError('The goal was not deleted.');
  });
}

export async function contributeToGoal(
  database: DbDriver,
  input: ContributionInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateContributionInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    const goal = await getGoal(transaction, input.goalId);
    if (!goal) throw new GoalServiceError('The goal is unavailable.');

    const result = await transaction.run(goalsSql.insertContribution, {
      $goalId: input.goalId,
      $date: input.date,
      $amountMinor: Number(input.amountMinor),
      $note: input.note ?? null,
      $createdAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function removeContribution(database: DbDriver, contributionId: number): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const contribution = await transaction.get<ContributionRow>(
      'SELECT id FROM goal_contributions WHERE id = $id',
      { $id: contributionId },
    );
    if (!contribution) throw new GoalServiceError('The contribution is unavailable.');
    const result = await transaction.run(goalsSql.deleteContribution, { $id: contributionId });
    if (result.changes !== 1) throw new GoalServiceError('The contribution was not deleted.');
  });
}

export async function markAchieved(
  database: DbDriver,
  goalId: number,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const goal = await getGoal(transaction, goalId);
    if (!goal) throw new GoalServiceError('The goal is unavailable.');
    const result = await transaction.run(goalsSql.markAchieved, {
      $id: goalId,
      $achievedAt: now(),
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new GoalServiceError('The goal was not marked achieved.');
  });
}

export async function markActive(
  database: DbDriver,
  goalId: number,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const goal = await getGoal(transaction, goalId);
    if (!goal) throw new GoalServiceError('The goal is unavailable.');
    const result = await transaction.run(goalsSql.markActive, {
      $id: goalId,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new GoalServiceError('The goal was not marked active.');
  });
}

export async function archiveGoal(
  database: DbDriver,
  goalId: number,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const goal = await getGoal(transaction, goalId);
    if (!goal) throw new GoalServiceError('The goal is unavailable.');
    const result = await transaction.run(goalsSql.archiveGoal, {
      $id: goalId,
      $archivedAt: now(),
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new GoalServiceError('The goal was not archived.');
  });
}

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    targetMinor: BigInt(row.target_minor),
    targetDate: row.target_date,
    accountId: row.account_id,
    totalContributed: BigInt(row.total_contributed),
    achievedAt: row.achieved_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContribution(row: ContributionRow): GoalContribution {
  return {
    id: row.id,
    goalId: row.goal_id,
    date: row.date,
    amountMinor: BigInt(row.amount_minor),
    note: row.note,
    createdAt: row.created_at,
  };
}

function validateGoalInput(input: GoalInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new GoalServiceError('Goal name must not be empty.');
  }
  if (input.currency !== 'USD' && input.currency !== 'LBP') {
    throw new GoalServiceError('Currency must be USD or LBP.');
  }
  if (input.targetMinor <= 0n) {
    throw new GoalServiceError('Target amount must be greater than zero.');
  }
  if (input.targetDate !== null && input.targetDate !== undefined) {
    validateDateFormat(input.targetDate);
  }
}

function validateContributionInput(input: ContributionInput): void {
  if (!Number.isInteger(input.goalId) || input.goalId <= 0) {
    throw new GoalServiceError('Goal ID must be a positive integer.');
  }
  validateDateFormat(input.date);
  if (input.amountMinor === 0n) {
    throw new GoalServiceError('Contribution amount must not be zero.');
  }
}

function validateDateFormat(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new GoalServiceError('Date must be in YYYY-MM-DD format.');
  }
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new GoalServiceError('Date must be a valid calendar date.');
  }
}

async function validateAccountExists(database: DbDriver, accountId: number): Promise<void> {
  const row = await database.get<IdRow>(
    'SELECT id FROM accounts WHERE id = $id AND archived_at IS NULL',
    { $id: accountId },
  );
  if (!row) {
    throw new GoalServiceError('The selected account is not available or has been archived.');
  }
}

function toSafeId(id: unknown): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new GoalServiceError('Invalid goal ID generated.');
  }
  return value;
}
