import type { DbDriver } from '@/db/driver';
import { ledgerSql } from '@/db/sql/ledger.sql';
import {
  assertValidEntryAmount,
  assertValidRate,
  calculateEntryEquivalents,
  createTransferLegs,
  type Currency,
} from '@/domain/money';

export type FlowKind = 'income' | 'expense' | 'refund';
export type TransferKind = 'transfer';
export type RateOrigin = 'source' | 'manual' | 'implied' | 'inherited';

export interface TransactionEntryInput {
  accountId: number;
  categoryId: number;
  amountMinor: bigint;
  memo?: string | null;
}

export interface TransactionInput {
  kind: FlowKind;
  date: string;
  accountId?: number;
  categoryId?: number;
  amountMinor?: bigint;
  entries?: TransactionEntryInput[];
  rateE4: bigint;
  rateOrigin?: Exclude<RateOrigin, 'implied' | 'inherited'>;
  rateSourceId?: number | null;
  rateSourceLabel?: string | null;
  rateId?: number | null;
  rateDate?: string | null;
  payee?: string | null;
  note?: string | null;
  memo?: string | null;
}

export interface LedgerEntry {
  id: number;
  transactionId: number;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryBuiltinKey: string | null;
  currency: Currency;
  amountMinor: bigint;
  usdMinor: bigint;
  lbpMinor: bigint;
  memo: string | null;
}

export interface LedgerTransaction {
  id: number;
  kind: FlowKind | 'transfer';
  date: string;
  rateE4: bigint;
  rateOrigin: RateOrigin;
  rateSourceId: number | null;
  rateSourceLabel: string | null;
  rateId: number | null;
  rateDate: string | null;
  payee: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  entries: LedgerEntry[];
}

export interface TransferLegInput {
  accountId: number;
  amountMinor: bigint;
}

export interface TransferInput {
  date: string;
  source: TransferLegInput;
  destination: TransferLegInput;
  rateE4: bigint;
  feeAccountId?: number | null;
  feeAmountMinor?: bigint | null;
  feeCategoryId?: number | null;
  payee?: string | null;
  note?: string | null;
}

export class LedgerServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerServiceError';
  }
}
export const LedgerError = LedgerServiceError;

interface AccountRow { id: number; name: string; currency: Currency; archived_at: string | null }
interface CategoryRow { id: number; name: string | null; kind: 'income' | 'expense'; archived_at: string | null }
interface TransactionRow {
  id: number;
  kind: FlowKind | 'transfer';
  date: string;
  lbp_per_usd_e4: number;
  rate_origin: RateOrigin;
  rate_source_id: number | null;
  rate_source_label: string | null;
  rate_id: number | null;
  rate_date: string | null;
  payee: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
interface EntryRow {
  id: number;
  transaction_id: number;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string | null;
  category_builtin_key: string | null;
  currency: Currency;
  amount_minor: string;
  usd_minor: string;
  lbp_minor: string;
  memo: string | null;
}
interface ViolationRow { rule: string }

export async function createTransaction(
  database: DbDriver,
  input: TransactionInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateDate(input.date);
  assertValidRate(input.rateE4);
  const entries = normalizeEntryInputs(input);

  return database.exclusiveTransaction(async (transaction) => {
    for (const entry of entries) {
      await validateFlowEntry(transaction, input.kind, entry.accountId, entry.categoryId);
    }

    const timestamp = now();
    const rateOrigin = input.rateOrigin ?? 'manual';
    const header = await transaction.run(ledgerSql.insertTransaction, {
      $kind: input.kind,
      $date: input.date,
      $rateE4: Number(input.rateE4),
      $rateOrigin: rateOrigin,
      $rateSourceId: rateOrigin === 'source' ? input.rateSourceId ?? null : null,
      $rateSourceLabel: input.rateSourceLabel ?? null,
      $rateId: input.rateId ?? null,
      $rateDate: input.rateDate ?? null,
      $payee: normalizeNullable(input.payee),
      $note: normalizeNullable(input.note),
      $createdAt: timestamp,
      $updatedAt: timestamp,
    });
    const transactionId = toSafeId(header.lastInsertRowId);

    for (const entry of entries) {
      const account = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: entry.accountId });
      if (!account) throw new LedgerServiceError('The account is unavailable.');
      const equivalents = calculateEntryEquivalents(entry.amountMinor, account.currency, input.rateE4);
      await transaction.run(ledgerSql.insertEntry, {
        $transactionId: transactionId,
        $accountId: entry.accountId,
        $categoryId: entry.categoryId,
        $currency: account.currency,
        $amountMinor: entry.amountMinor.toString(),
        $usdMinor: equivalents.usdMinor.toString(),
        $lbpMinor: equivalents.lbpMinor.toString(),
        $memo: normalizeNullable(entry.memo),
      });
    }

    await assertNoViolations(transaction, transactionId);
    return transactionId;
  });
}

export async function updateTransaction(
  database: DbDriver,
  transactionId: number,
  input: TransactionInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateDate(input.date);
  assertValidRate(input.rateE4);
  const entries = normalizeEntryInputs(input);

  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<TransactionRow>(ledgerSql.getTransaction, { $id: transactionId });
    if (!current) throw new LedgerServiceError('The transaction is unavailable.');
    if (current.kind !== input.kind) throw new LedgerServiceError('Transaction kind is immutable.');
    for (const entry of entries) {
      await validateFlowEntry(transaction, input.kind, entry.accountId, entry.categoryId);
    }

    const rateOrigin = input.rateOrigin ?? current.rate_origin;
    await transaction.run(ledgerSql.updateTransaction, {
      $id: transactionId,
      $date: input.date,
      $rateE4: Number(input.rateE4),
      $rateOrigin: rateOrigin,
      $rateSourceId: rateOrigin === 'source' ? input.rateSourceId ?? current.rate_source_id : null,
      $rateSourceLabel: input.rateSourceLabel ?? current.rate_source_label,
      $rateId: input.rateId ?? current.rate_id,
      $rateDate: input.rateDate ?? current.rate_date,
      $payee: normalizeNullable(input.payee ?? current.payee),
      $note: normalizeNullable(input.note ?? current.note),
      $updatedAt: now(),
    });
    await transaction.run(ledgerSql.deleteEntries, { $transactionId: transactionId });

    for (const entry of entries) {
      const account = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: entry.accountId });
      if (!account) throw new LedgerServiceError('The account is unavailable.');
      const equivalents = calculateEntryEquivalents(entry.amountMinor, account.currency, input.rateE4);
      await transaction.run(ledgerSql.insertEntry, {
        $transactionId: transactionId,
        $accountId: entry.accountId,
        $categoryId: entry.categoryId,
        $currency: account.currency,
        $amountMinor: entry.amountMinor.toString(),
        $usdMinor: equivalents.usdMinor.toString(),
        $lbpMinor: equivalents.lbpMinor.toString(),
        $memo: normalizeNullable(entry.memo),
      });
    }
    await assertNoViolations(transaction, transactionId);
  });
}

export async function deleteTransaction(database: DbDriver, transactionId: number): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<TransactionRow>(ledgerSql.getTransaction, { $id: transactionId });
    if (!current) throw new LedgerServiceError('The transaction is unavailable.');
    if (current.kind === 'transfer') {
      const feeRows = await transaction.all<{ id: number }>(ledgerSql.listTransferFees, { $transferId: transactionId });
      for (const fee of feeRows) await transaction.run(ledgerSql.deleteTransaction, { $id: fee.id });
      await transaction.run(ledgerSql.deleteTransaction, { $id: transactionId });
      return;
    }
    if (!['income', 'expense', 'refund'].includes(current.kind)) {
      throw new LedgerServiceError('This transaction kind cannot be deleted here.');
    }
    await transaction.run(ledgerSql.deleteTransaction, { $id: transactionId });
  });
}

export async function createTransfer(
  database: DbDriver,
  input: TransferInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateDate(input.date);
  assertValidRate(input.rateE4);
  if (input.source.accountId === input.destination.accountId) {
    throw new LedgerServiceError('A transfer requires two different accounts.');
  }

  return database.exclusiveTransaction(async (transaction) => {
    const source = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: input.source.accountId });
    const destination = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: input.destination.accountId });
    if (!source || source.archived_at !== null || !destination || destination.archived_at !== null) {
      throw new LedgerServiceError('A transfer account is unavailable.');
    }
    if (input.source.amountMinor <= 0n) {
      throw new LedgerServiceError('Transfer amount must be positive.');
    }

    const legs = createTransferLegs(
      source.currency,
      destination.currency,
      input.source.amountMinor,
      input.rateE4,
    );
    const timestamp = now();
    const header = await transaction.run(ledgerSql.insertTransaction, {
      $kind: 'transfer',
      $date: input.date,
      $rateE4: Number(input.rateE4),
      $rateOrigin: 'manual',
      $rateSourceId: null,
      $rateSourceLabel: null,
      $rateId: null,
      $rateDate: null,
      $payee: normalizeNullable(input.payee),
      $note: normalizeNullable(input.note),
      $createdAt: timestamp,
      $updatedAt: timestamp,
    });
    const transferId = toSafeId(header.lastInsertRowId);
    await insertTransferLeg(transaction, transferId, source, legs.source);
    await insertTransferLeg(transaction, transferId, destination, legs.destination);
    await createOptionalTransferFee(transaction, transferId, input, timestamp);
    await assertNoViolations(transaction, transferId);
    return transferId;
  });
}

export async function updateTransfer(
  database: DbDriver,
  transferId: number,
  input: TransferInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateDate(input.date);
  assertValidRate(input.rateE4);
  if (input.source.accountId === input.destination.accountId) {
    throw new LedgerServiceError('A transfer requires two different accounts.');
  }

  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<TransactionRow>(ledgerSql.getTransaction, { $id: transferId });
    if (!current || current.kind !== 'transfer') throw new LedgerServiceError('The transfer is unavailable.');
    const source = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: input.source.accountId });
    const destination = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: input.destination.accountId });
    if (!source || source.archived_at !== null || !destination || destination.archived_at !== null) {
      throw new LedgerServiceError('A transfer account is unavailable.');
    }
    if (input.source.amountMinor <= 0n) throw new LedgerServiceError('Transfer amount must be positive.');
    const legs = createTransferLegs(source.currency, destination.currency, input.source.amountMinor, input.rateE4);

    await transaction.run(ledgerSql.updateTransaction, {
      $id: transferId,
      $date: input.date,
      $rateE4: Number(input.rateE4),
      $rateOrigin: 'manual',
      $rateSourceId: null,
      $rateSourceLabel: null,
      $rateId: null,
      $rateDate: null,
      $payee: normalizeNullable(input.payee),
      $note: normalizeNullable(input.note),
      $updatedAt: now(),
    });
    await transaction.run(ledgerSql.deleteEntries, { $transactionId: transferId });
    await insertTransferLeg(transaction, transferId, source, legs.source);
    await insertTransferLeg(transaction, transferId, destination, legs.destination);

    const feeRows = await transaction.all<{ id: number }>(ledgerSql.listTransferFees, { $transferId: transferId });
    for (const fee of feeRows) await transaction.run(ledgerSql.deleteTransaction, { $id: fee.id });
    await createOptionalTransferFee(transaction, transferId, input, now());
    await assertNoViolations(transaction, transferId);
  });
}

export async function deleteTransfer(
  database: DbDriver,
  transferId: number,
  deleteFee = true,
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<TransactionRow>(ledgerSql.getTransaction, { $id: transferId });
    if (!current || current.kind !== 'transfer') throw new LedgerServiceError('The transfer is unavailable.');
    const feeRows = await transaction.all<{ id: number }>(ledgerSql.listTransferFees, { $transferId: transferId });
    if (deleteFee) {
      for (const fee of feeRows) await transaction.run(ledgerSql.deleteTransaction, { $id: fee.id });
    } else if (feeRows.length > 0) {
      throw new LedgerServiceError('Unlink the transfer fee before keeping it.');
    }
    await transaction.run(ledgerSql.deleteTransaction, { $id: transferId });
  });
}

export async function getTransaction(database: DbDriver, transactionId: number): Promise<LedgerTransaction | null> {
  const current = await database.get<TransactionRow>(ledgerSql.getTransaction, { $id: transactionId });
  if (!current) return null;
  return mapTransaction(database, current);
}

export async function listTransactions(database: DbDriver): Promise<LedgerTransaction[]> {
  const rows = await database.all<TransactionRow>(ledgerSql.listTransactions);
  const transactions: LedgerTransaction[] = [];
  for (const row of rows) transactions.push(await mapTransaction(database, row));
  return transactions;
}

async function insertTransferLeg(
  transaction: DbDriver,
  transferId: number,
  account: AccountRow,
  leg: { currency: Currency; amountMinor: bigint; usdMinor: bigint; lbpMinor: bigint },
): Promise<void> {
  await transaction.run(ledgerSql.insertEntry, {
    $transactionId: transferId,
    $accountId: account.id,
    $categoryId: null,
    $currency: leg.currency,
    $amountMinor: leg.amountMinor.toString(),
    $usdMinor: leg.usdMinor.toString(),
    $lbpMinor: leg.lbpMinor.toString(),
    $memo: null,
  });
}

async function createOptionalTransferFee(
  transaction: DbDriver,
  transferId: number,
  input: TransferInput,
  timestamp: string,
): Promise<void> {
  if (input.feeAmountMinor == null) return;
  if (input.feeAmountMinor <= 0n) throw new LedgerServiceError('Transfer fee must be positive.');
  if (input.feeAccountId == null || input.feeCategoryId == null) {
    throw new LedgerServiceError('A transfer fee requires an account and expense category.');
  }
  if (input.feeAccountId !== input.source.accountId && input.feeAccountId !== input.destination.accountId) {
    throw new LedgerServiceError('The fee account must belong to the transfer.');
  }
  const feeAccount = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: input.feeAccountId });
  const feeCategory = await transaction.get<CategoryRow>(ledgerSql.getCategory, { $id: input.feeCategoryId });
  if (!feeAccount || feeAccount.archived_at !== null) throw new LedgerServiceError('The fee account is unavailable.');
  if (!feeCategory || feeCategory.archived_at !== null || feeCategory.kind !== 'expense') {
    throw new LedgerServiceError('The fee category is unavailable.');
  }

  const header = await transaction.run(ledgerSql.insertLinkedFee, {
    $date: input.date,
    $rateE4: Number(input.rateE4),
    $parentId: transferId,
    $payee: normalizeNullable(input.payee),
    $note: normalizeNullable(input.note),
    $createdAt: timestamp,
    $updatedAt: timestamp,
  });
  const feeId = toSafeId(header.lastInsertRowId);
  const feeAmount = -input.feeAmountMinor;
  const equivalents = calculateEntryEquivalents(feeAmount, feeAccount.currency, input.rateE4);
  await transaction.run(ledgerSql.insertEntry, {
    $transactionId: feeId,
    $accountId: feeAccount.id,
    $categoryId: feeCategory.id,
    $currency: feeAccount.currency,
    $amountMinor: feeAmount.toString(),
    $usdMinor: equivalents.usdMinor.toString(),
    $lbpMinor: equivalents.lbpMinor.toString(),
    $memo: null,
  });
  await assertNoViolations(transaction, feeId);
}

export const createIncome = createTransaction;
export const createExpense = createTransaction;
export const createRefund = createTransaction;

async function mapTransaction(database: DbDriver, row: TransactionRow): Promise<LedgerTransaction> {
  const rows = await database.all<EntryRow>(ledgerSql.listEntries, { $transactionId: row.id });
  return {
    id: row.id,
    kind: row.kind,
    date: row.date,
    rateE4: BigInt(row.lbp_per_usd_e4),
    rateOrigin: row.rate_origin,
    rateSourceId: row.rate_source_id,
    rateSourceLabel: row.rate_source_label,
    rateId: row.rate_id,
    rateDate: row.rate_date,
    payee: row.payee,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entries: rows.map((entry) => ({
      id: entry.id,
      transactionId: entry.transaction_id,
      accountId: entry.account_id,
      accountName: entry.account_name,
      categoryId: entry.category_id,
      categoryName: entry.category_name,
      categoryBuiltinKey: entry.category_builtin_key,
      currency: entry.currency,
      amountMinor: BigInt(entry.amount_minor),
      usdMinor: BigInt(entry.usd_minor),
      lbpMinor: BigInt(entry.lbp_minor),
      memo: entry.memo,
    })),
  };
}

function normalizeEntryInputs(input: TransactionInput): TransactionEntryInput[] {
  if (input.entries && input.entries.length > 0) {
    if (input.entries.length !== 1) throw new LedgerServiceError('Income, expense, and refund transactions use one account.');
    const entry = input.entries[0]!;
    return [{ ...entry, amountMinor: signedAmount(input.kind, entry.amountMinor) }];
  }
  if (input.accountId === undefined || input.categoryId === undefined || input.amountMinor === undefined) {
    throw new LedgerServiceError('An account, category, and amount are required.');
  }
  return [{
    accountId: input.accountId,
    categoryId: input.categoryId,
    amountMinor: signedAmount(input.kind, input.amountMinor),
    memo: input.memo,
  }];
}

function signedAmount(kind: FlowKind, amountMinor: bigint): bigint {
  assertValidEntryAmount(amountMinor);
  if (kind === 'expense') {
    if (amountMinor > 0n) return -amountMinor;
  } else if (amountMinor < 0n) {
    return -amountMinor;
  }
  return amountMinor;
}

async function validateFlowEntry(
  transaction: DbDriver,
  kind: FlowKind,
  accountId: number,
  categoryId: number,
): Promise<void> {
  const account = await transaction.get<AccountRow>(ledgerSql.getAccount, { $id: accountId });
  if (!account || account.archived_at !== null) throw new LedgerServiceError('The account is unavailable.');
  const category = await transaction.get<CategoryRow>(ledgerSql.getCategory, { $id: categoryId });
  if (!category || category.archived_at !== null) throw new LedgerServiceError('The category is unavailable.');
  const expected = kind === 'income' ? 'income' : 'expense';
  if (category.kind !== expected) throw new LedgerServiceError('The category kind does not match the transaction.');
}

async function assertNoViolations(transaction: DbDriver, transactionId: number): Promise<void> {
  const violations = await transaction.all<ViolationRow>(ledgerSql.violationsForTransaction, {
    $transactionId: transactionId,
  });
  if (violations.length > 0) throw new LedgerServiceError(`Ledger validation failed: ${violations[0]!.rule}`);
}

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new LedgerServiceError('Enter a valid calendar date.');
  const [year, month, day] = date.split('-').map((part) => Number(part));
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month! - 1 || parsed.getUTCDate() !== day) {
    throw new LedgerServiceError('Enter a valid calendar date.');
  }
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toSafeId(value: number | bigint): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new LedgerServiceError('The database returned an invalid identifier.');
  return id;
}
