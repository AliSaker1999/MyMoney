import type { DbDriver } from '@/db/driver';
import { debtsSql } from '@/db/sql/debts.sql';
import type { Currency } from '@/domain/money';

export type DebtDirection = 'i_owe' | 'owed_to_me';

export interface Debt {
  id: number;
  counterparty: string;
  direction: DebtDirection;
  currency: Currency;
  startDate: string;
  dueDate: string | null;
  outstandingMinor: bigint;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtMovement {
  id: number;
  debtId: number;
  transactionId: number | null;
  date: string;
  amountMinor: bigint;
  createdAt: string;
}

export interface DebtInput {
  counterparty: string;
  direction: DebtDirection;
  currency: Currency;
  startDate: string;
  dueDate?: string | null;
  note?: string | null;
}

export interface DebtMovementInput {
  debtId: number;
  date: string;
  amountMinor: bigint;
  transactionId?: number | null;
}

export class DebtServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebtServiceError';
  }
}

interface DebtRow {
  id: number;
  counterparty: string;
  direction: DebtDirection;
  currency: Currency;
  start_date: string;
  due_date: string | null;
  outstanding_minor: string;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DebtMovementRow {
  id: number;
  debt_id: number;
  transaction_id: number | null;
  date: string;
  amount_minor: string;
  created_at: string;
}

export async function listDebts(database: DbDriver): Promise<Debt[]> {
  const rows = await database.all<DebtRow>(debtsSql.listDebts);
  return rows.map(mapDebt);
}

export async function getDebt(database: DbDriver, debtId: number): Promise<Debt | null> {
  const row = await database.get<DebtRow>(debtsSql.getDebt, { $id: debtId });
  return row ? mapDebt(row) : null;
}

export async function getDebtMovements(
  database: DbDriver,
  debtId: number,
): Promise<DebtMovement[]> {
  const rows = await database.all<DebtMovementRow>(debtsSql.getDebtMovements, {
    $debtId: debtId,
  });
  return rows.map(mapDebtMovement);
}

export async function createDebt(
  database: DbDriver,
  input: DebtInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateDebtInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    const result = await transaction.run(debtsSql.insertDebt, {
      $counterparty: input.counterparty.trim(),
      $direction: input.direction,
      $currency: input.currency,
      $startDate: input.startDate,
      $dueDate: input.dueDate ?? null,
      $note: input.note ?? null,
      $createdAt: now(),
      $updatedAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function updateDebt(
  database: DbDriver,
  debtId: number,
  input: DebtInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateDebtInput(input);
  await database.exclusiveTransaction(async (transaction) => {
    const debt = await getDebt(transaction, debtId);
    if (!debt) throw new DebtServiceError('The debt is unavailable.');

    const result = await transaction.run(debtsSql.updateDebt, {
      $id: debtId,
      $counterparty: input.counterparty.trim(),
      $dueDate: input.dueDate ?? null,
      $note: input.note ?? null,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new DebtServiceError('The debt was not updated.');
  });
}

export async function deleteDebt(database: DbDriver, debtId: number): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const debt = await getDebt(transaction, debtId);
    if (!debt) throw new DebtServiceError('The debt is unavailable.');
    const result = await transaction.run(debtsSql.deleteDebt, { $id: debtId });
    if (result.changes !== 1) throw new DebtServiceError('The debt was not deleted.');
  });
}

export async function recordDebtMovement(
  database: DbDriver,
  input: DebtMovementInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateDebtMovementInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    const debt = await getDebt(transaction, input.debtId);
    if (!debt) throw new DebtServiceError('The debt is unavailable.');

    const result = await transaction.run(debtsSql.insertDebtMovement, {
      $debtId: input.debtId,
      $transactionId: input.transactionId ?? null,
      $date: input.date,
      $amountMinor: Number(input.amountMinor),
      $createdAt: now(),
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function removeDebtMovement(
  database: DbDriver,
  movementId: number,
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const movement = await transaction.get<DebtMovementRow>(
      'SELECT id FROM debt_movements WHERE id = $id',
      { $id: movementId },
    );
    if (!movement) throw new DebtServiceError('The movement is unavailable.');
    const result = await transaction.run(debtsSql.deleteDebtMovement, { $id: movementId });
    if (result.changes !== 1) throw new DebtServiceError('The movement was not deleted.');
  });
}

export async function settleDebt(
  database: DbDriver,
  debtId: number,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const debt = await getDebt(transaction, debtId);
    if (!debt) throw new DebtServiceError('The debt is unavailable.');
    const result = await transaction.run(debtsSql.settleDebt, {
      $id: debtId,
      $settledAt: now(),
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new DebtServiceError('The debt was not settled.');
  });
}

export async function reopenDebt(
  database: DbDriver,
  debtId: number,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const debt = await getDebt(transaction, debtId);
    if (!debt) throw new DebtServiceError('The debt is unavailable.');
    const result = await transaction.run(debtsSql.reopenDebt, {
      $id: debtId,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new DebtServiceError('The debt was not reopened.');
  });
}

function mapDebt(row: DebtRow): Debt {
  return {
    id: row.id,
    counterparty: row.counterparty,
    direction: row.direction,
    currency: row.currency,
    startDate: row.start_date,
    dueDate: row.due_date,
    outstandingMinor: BigInt(row.outstanding_minor),
    settledAt: row.settled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDebtMovement(row: DebtMovementRow): DebtMovement {
  return {
    id: row.id,
    debtId: row.debt_id,
    transactionId: row.transaction_id,
    date: row.date,
    amountMinor: BigInt(row.amount_minor),
    createdAt: row.created_at,
  };
}

function validateDebtInput(input: DebtInput): void {
  if (!input.counterparty || input.counterparty.trim().length === 0) {
    throw new DebtServiceError('Counterparty name must not be empty.');
  }
  if (input.direction !== 'i_owe' && input.direction !== 'owed_to_me') {
    throw new DebtServiceError('Direction must be "i_owe" or "owed_to_me".');
  }
  if (input.currency !== 'USD' && input.currency !== 'LBP') {
    throw new DebtServiceError('Currency must be USD or LBP.');
  }
  validateDateFormat(input.startDate);
  if (input.dueDate !== null && input.dueDate !== undefined) {
    validateDateFormat(input.dueDate);
  }
}

function validateDebtMovementInput(input: DebtMovementInput): void {
  if (!Number.isInteger(input.debtId) || input.debtId <= 0) {
    throw new DebtServiceError('Debt ID must be a positive integer.');
  }
  validateDateFormat(input.date);
  if (input.amountMinor === 0n) {
    throw new DebtServiceError('Movement amount must not be zero.');
  }
}

function validateDateFormat(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new DebtServiceError('Date must be in YYYY-MM-DD format.');
  }
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new DebtServiceError('Date must be a valid calendar date.');
  }
}

function toSafeId(id: unknown): number {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DebtServiceError('Invalid debt ID generated.');
  }
  return value;
}
