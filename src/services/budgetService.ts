import type { DbDriver } from '@/db/driver';
import { budgetsSql } from '@/db/sql/budgets.sql';
import { type Currency } from '@/domain/money';

export interface Budget {
  id: number;
  categoryId: number;
  categoryName: string | null;
  categoryBuiltinKey: string | null;
  currency: Currency;
  amountMinor: bigint;
  startMonth: string;
  endMonth: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetInput {
  categoryId: number;
  currency: Currency;
  amountMinor: bigint;
  startMonth: string;
  endMonth?: string | null;
}

export interface BudgetExpense {
  id: number;
  categoryId: number;
  categoryName: string | null;
  categoryBuiltinKey: string | null;
  currency: Currency;
  amountMinor: bigint;
  spentUsdMinor: bigint;
  spentLbpMinor: bigint;
  spentPercentage: number;
  isOverBudget: boolean;
}

export class BudgetServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetServiceError';
  }
}

interface BudgetRow {
  id: number;
  category_id: number;
  category_name: string | null;
  category_builtin_key: string | null;
  currency: Currency;
  amount_minor: string;
  start_month: string;
  end_month: string | null;
  created_at: string;
  updated_at: string;
}

interface BudgetOverlapRow {
  id: number;
}

interface BudgetExpenseRow {
  spent_usd_minor: string;
  spent_lbp_minor: string;
}

interface IdRow {
  id: number;
}

export async function listBudgets(database: DbDriver): Promise<Budget[]> {
  const rows = await database.all<BudgetRow>(budgetsSql.listBudgets);
  return rows.map(mapBudget);
}

export async function getBudget(database: DbDriver, budgetId: number): Promise<Budget | null> {
  const row = await database.get<BudgetRow>(budgetsSql.getBudget, { $id: budgetId });
  return row ? mapBudget(row) : null;
}

export async function createBudget(
  database: DbDriver,
  input: BudgetInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateBudgetInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    await validateCategoryExists(transaction, input.categoryId);
    const hasOverlap = await checkBudgetOverlap(
      transaction,
      input.categoryId,
      input.currency,
      input.startMonth,
      input.endMonth ?? null,
    );
    if (hasOverlap) {
      throw new BudgetServiceError(
        'A budget already exists for this category in this period.',
      );
    }
    const result = await transaction.run(budgetsSql.insertBudget, {
      $categoryId: input.categoryId,
      $currency: input.currency,
      $amountMinor: Number(input.amountMinor),
      $startMonth: input.startMonth,
      $endMonth: input.endMonth ?? null,
      $createdAt: now(),
      $updatedAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function updateBudget(
  database: DbDriver,
  budgetId: number,
  input: BudgetInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateBudgetInput(input);
  await database.exclusiveTransaction(async (transaction) => {
    const budget = await getBudget(transaction, budgetId);
    if (!budget) throw new BudgetServiceError('The budget is unavailable.');

    // Check overlap if category or dates changed
    if (
      budget.categoryId !== input.categoryId ||
      budget.startMonth !== input.startMonth ||
      budget.endMonth !== (input.endMonth ?? null)
    ) {
      const hasOverlap = await checkBudgetOverlap(
        transaction,
        input.categoryId,
        input.currency,
        input.startMonth,
        input.endMonth ?? null,
        budgetId,
      );
      if (hasOverlap) {
        throw new BudgetServiceError(
          'A budget already exists for this category in this period.',
        );
      }
    }

    if (input.categoryId !== budget.categoryId) {
      await validateCategoryExists(transaction, input.categoryId);
    }

    const result = await transaction.run(budgetsSql.updateBudget, {
      $id: budgetId,
      $amountMinor: Number(input.amountMinor),
      $endMonth: input.endMonth ?? null,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new BudgetServiceError('The budget was not updated.');
  });
}

export async function deleteBudget(database: DbDriver, budgetId: number): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const budget = await getBudget(transaction, budgetId);
    if (!budget) throw new BudgetServiceError('The budget is unavailable.');
    const result = await transaction.run(budgetsSql.deleteBudget, { $id: budgetId });
    if (result.changes !== 1) throw new BudgetServiceError('The budget was not deleted.');
  });
}

export async function getBudgetExpenseTracking(
  database: DbDriver,
  categoryId: number,
  month: string,
): Promise<BudgetExpense | null> {
  validateMonthFormat(month);
  const budget = await database.get<BudgetRow>(
    `SELECT * FROM budgets WHERE category_id = $categoryId AND start_month <= $month AND (end_month IS NULL OR end_month >= $month) LIMIT 1`,
    { $categoryId: categoryId, $month: month },
  );
  if (!budget) return null;

  const expenseRow = await database.get<BudgetExpenseRow>(budgetsSql.budgetExpensesByMonth, {
    $categoryId: categoryId,
    $month: month,
  });

  const spentUsdMinor = BigInt(expenseRow?.spent_usd_minor ?? '0');
  const spentLbpMinor = BigInt(expenseRow?.spent_lbp_minor ?? '0');
  const amountMinor = BigInt(budget.amount_minor);

  const spentInBudgetCurrency =
    budget.currency === 'USD' ? spentUsdMinor : spentLbpMinor;
  const spentPercentage = amountMinor > 0n
    ? Number((spentInBudgetCurrency * 100n) / amountMinor)
    : 0;

  return {
    id: budget.id,
    categoryId: budget.category_id,
    categoryName: budget.category_name,
    categoryBuiltinKey: budget.category_builtin_key,
    currency: budget.currency,
    amountMinor,
    spentUsdMinor,
    spentLbpMinor,
    spentPercentage,
    isOverBudget: spentInBudgetCurrency > amountMinor,
  };
}

export async function getBudgetsByMonth(
  database: DbDriver,
  month: string,
): Promise<BudgetExpense[]> {
  validateMonthFormat(month);
  const rows = await database.all<BudgetRow>(budgetsSql.budgetsByMonth, { $month: month });
  const result: BudgetExpense[] = [];

  for (const row of rows) {
    const expenseRow = await database.get<BudgetExpenseRow>(budgetsSql.budgetExpensesByMonth, {
      $categoryId: row.category_id,
      $month: month,
    });

    const spentUsdMinor = BigInt(expenseRow?.spent_usd_minor ?? '0');
    const spentLbpMinor = BigInt(expenseRow?.spent_lbp_minor ?? '0');
    const amountMinor = BigInt(row.amount_minor);

    const spentInBudgetCurrency = row.currency === 'USD' ? spentUsdMinor : spentLbpMinor;
    const spentPercentage = amountMinor > 0n
      ? Number((spentInBudgetCurrency * 100n) / amountMinor)
      : 0;

    result.push({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryBuiltinKey: row.category_builtin_key,
      currency: row.currency,
      amountMinor,
      spentUsdMinor,
      spentLbpMinor,
      spentPercentage,
      isOverBudget: spentInBudgetCurrency > amountMinor,
    });
  }

  return result;
}

function mapBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryBuiltinKey: row.category_builtin_key,
    currency: row.currency,
    amountMinor: BigInt(row.amount_minor),
    startMonth: row.start_month,
    endMonth: row.end_month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateBudgetInput(input: BudgetInput): void {
  if (!Number.isInteger(input.categoryId) || input.categoryId <= 0) {
    throw new BudgetServiceError('Category ID must be a positive integer.');
  }
  if (input.currency !== 'USD' && input.currency !== 'LBP') {
    throw new BudgetServiceError('Currency must be USD or LBP.');
  }
  if (input.amountMinor <= 0n) {
    throw new BudgetServiceError('Budget amount must be greater than zero.');
  }
  validateMonthFormat(input.startMonth);
  if (input.endMonth !== null && input.endMonth !== undefined) {
    validateMonthFormat(input.endMonth);
    if (input.endMonth < input.startMonth) {
      throw new BudgetServiceError('End month cannot be before start month.');
    }
  }
}

export function validateMonthFormat(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new BudgetServiceError('Month must be in YYYY-MM format.');
  }
  const date = new Date(`${month}-01`);
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== month) {
    throw new BudgetServiceError('Month must be a valid date.');
  }
}

async function validateCategoryExists(database: DbDriver, categoryId: number): Promise<void> {
  const row = await database.get<IdRow>(
    'SELECT id FROM categories WHERE id = $id AND kind = \'expense\' AND archived_at IS NULL',
    { $id: categoryId },
  );
  if (!row) {
    throw new BudgetServiceError('Select an active expense category.');
  }
}

async function checkBudgetOverlap(
  database: DbDriver,
  categoryId: number,
  currency: Currency,
  startMonth: string,
  endMonth: string | null,
  excludeBudgetId?: number,
): Promise<boolean> {
  const row = await database.get<BudgetOverlapRow>(budgetsSql.findBudgetOverlap, {
    $categoryId: categoryId,
    $currency: currency,
    $startMonth: startMonth,
    $endMonth: endMonth ?? startMonth,
    $excludeBudgetId: excludeBudgetId ?? -1,
  });
  return !!row;
}

function toSafeId(id: unknown): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BudgetServiceError('Invalid budget ID generated.');
  }
  return value;
}
