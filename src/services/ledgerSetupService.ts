import type { DbDriver } from '@/db/driver';
import { accountsSql } from '@/db/sql/accounts.sql';
import { categoriesSql } from '@/db/sql/categories.sql';
import { ledgerSetupSql } from '@/db/sql/ledgerSetup.sql';
import {
  assertValidEntryAmount,
  assertValidRate,
  calculateEntryEquivalents,
  type Currency,
} from '@/domain/money';
import type { AccountCurrency, AccountType } from '@/services/onboardingService';

export type CategoryKind = 'income' | 'expense';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  includeInNetWorth: boolean;
  sortOrder: number;
  archivedAt: string | null;
  balanceMinor: bigint;
}

export interface Category {
  id: number;
  name: string | null;
  builtinKey: string | null;
  kind: CategoryKind;
  parentId: number | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  archivedAt: string | null;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  includeInNetWorth?: boolean;
  sortOrder?: number;
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  parentId?: number | null;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface OpeningBalanceInput {
  accountId: number;
  date: string;
  amountMinor: bigint;
  rateE4: bigint;
  memo?: string | null;
  rateSourceId?: number | null;
  rateSourceLabel?: string | null;
  rateId?: number | null;
  rateDate?: string | null;
}

export interface OpeningBalance {
  transactionId: number;
  entryId: number;
  accountId: number;
  date: string;
  currency: Currency;
  amountMinor: bigint;
  usdMinor: bigint;
  lbpMinor: bigint;
  memo: string | null;
  rateE4: bigint;
  rateOrigin: 'source' | 'manual';
  rateSourceId: number | null;
  rateSourceLabel: string | null;
}

export class LedgerSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerSetupError';
  }
}

interface AccountRow {
  id: number;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  include_in_net_worth: number;
  sort_order: number;
  archived_at: string | null;
  balance_minor: string;
}

interface CategoryRow {
  id: number;
  name: string | null;
  builtin_key: string | null;
  kind: CategoryKind;
  parent_id: number | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  archived_at: string | null;
}

interface IdRow { id: number }
interface CountRow { count: number }
interface OpeningRow {
  transaction_id: number;
  entry_id: number;
  date: string;
  lbp_per_usd_e4: number;
  rate_origin: 'source' | 'manual';
  rate_source_id: number | null;
  rate_source_label: string | null;
  currency: Currency;
  amount_minor: number;
  usd_minor: number;
  lbp_minor: number;
  memo: string | null;
}

export async function listAccounts(database: DbDriver): Promise<Account[]> {
  const rows = await database.all<AccountRow>(accountsSql.listAccounts);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    includeInNetWorth: row.include_in_net_worth === 1,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    balanceMinor: BigInt(row.balance_minor),
  }));
}

export async function createAccount(
  database: DbDriver,
  input: AccountInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateAccountInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    const normalized = input.name.trim();
    const duplicate = await transaction.get<IdRow>(accountsSql.findAccountByName, {
      $name: normalized,
    });
    if (duplicate) throw new LedgerSetupError('An active account with this name already exists.');
    const timestamp = now();
    const result = await transaction.run(accountsSql.insertAccount, {
      $name: normalized,
      $type: input.type,
      $currency: input.currency,
      $includeInNetWorth: input.includeInNetWorth === false ? 0 : 1,
      $sortOrder: input.sortOrder ?? 0,
      $createdAt: timestamp,
      $updatedAt: timestamp,
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function updateAccount(
  database: DbDriver,
  accountId: number,
  input: AccountInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateAccountInput(input);
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<AccountRow>(accountsSql.getAccount, { $id: accountId });
    if (!current || current.archived_at !== null) throw new LedgerSetupError('The account is unavailable.');
    if (current.currency !== input.currency) throw new LedgerSetupError('Account currency cannot be changed.');
    const duplicate = await transaction.get<IdRow>(accountsSql.findAccountByName, {
      $name: input.name.trim(),
    });
    if (duplicate && duplicate.id !== accountId) throw new LedgerSetupError('An active account with this name already exists.');
    const result = await transaction.run(accountsSql.updateAccount, {
      $id: accountId,
      $name: input.name.trim(),
      $type: input.type,
      $includeInNetWorth: input.includeInNetWorth === false ? 0 : 1,
      $sortOrder: input.sortOrder ?? 0,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new LedgerSetupError('The account was not updated.');
  });
}

export async function archiveAccount(
  database: DbDriver,
  accountId: number,
  archivedAt: string = new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<AccountRow>(accountsSql.getAccount, { $id: accountId });
    if (!current || current.archived_at !== null) throw new LedgerSetupError('The account is unavailable.');
    const result = await transaction.run(accountsSql.archiveAccount, {
      $id: accountId,
      $archivedAt: archivedAt,
    });
    if (result.changes !== 1) throw new LedgerSetupError('The account was not archived.');
  });
}

export async function listCategories(database: DbDriver): Promise<Category[]> {
  const rows = await database.all<CategoryRow>(categoriesSql.listCategories);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    builtinKey: row.builtin_key,
    kind: row.kind,
    parentId: row.parent_id,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  }));
}

export async function createCategory(
  database: DbDriver,
  input: CategoryInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  validateCategoryInput(input);
  return database.exclusiveTransaction(async (transaction) => {
    const normalized = input.name.trim();
    const duplicate = await transaction.get<IdRow>(categoriesSql.findCategoryByName, { $name: normalized });
    if (duplicate) throw new LedgerSetupError('An active category with this name already exists.');
    await validateParent(transaction, input.parentId ?? null, input.kind);
    const timestamp = now();
    const result = await transaction.run(categoriesSql.insertCategory, {
      $name: normalized,
      $kind: input.kind,
      $parentId: input.parentId ?? null,
      $icon: input.icon?.trim() || null,
      $color: input.color?.trim() || null,
      $sortOrder: input.sortOrder ?? 0,
      $createdAt: timestamp,
      $updatedAt: timestamp,
    });
    return toSafeId(result.lastInsertRowId);
  });
}

export async function updateCategory(
  database: DbDriver,
  categoryId: number,
  input: CategoryInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  validateCategoryInput(input);
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<CategoryRow>(categoriesSql.getCategory, { $id: categoryId });
    if (!current || current.archived_at !== null) throw new LedgerSetupError('The category is unavailable.');
    if (current.builtin_key !== null) throw new LedgerSetupError('Built-in categories cannot be renamed.');
    const duplicate = await transaction.get<IdRow>(categoriesSql.findCategoryByName, { $name: input.name.trim() });
    if (duplicate && duplicate.id !== categoryId) throw new LedgerSetupError('An active category with this name already exists.');
    await validateParent(transaction, input.parentId ?? null, input.kind);
    const result = await transaction.run(categoriesSql.updateCategory, {
      $id: categoryId,
      $name: input.name.trim(),
      $parentId: input.parentId ?? null,
      $icon: input.icon?.trim() || null,
      $color: input.color?.trim() || null,
      $sortOrder: input.sortOrder ?? 0,
      $updatedAt: now(),
    });
    if (result.changes !== 1) throw new LedgerSetupError('The category was not updated.');
  });
}

export async function archiveCategory(
  database: DbDriver,
  categoryId: number,
  archivedAt: string = new Date().toISOString(),
): Promise<void> {
  await database.exclusiveTransaction(async (transaction) => {
    const current = await transaction.get<CategoryRow>(categoriesSql.getCategory, { $id: categoryId });
    if (!current || current.archived_at !== null) throw new LedgerSetupError('The category is unavailable.');
    const result = await transaction.run(categoriesSql.archiveCategory, {
      $id: categoryId,
      $archivedAt: archivedAt,
    });
    if (result.changes !== 1) throw new LedgerSetupError('The category was not archived.');
  });
}

export async function setOpeningBalance(
  database: DbDriver,
  input: OpeningBalanceInput,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  if (!isIsoDate(input.date)) throw new LedgerSetupError('Enter a real opening-balance date.');
  try {
    assertValidEntryAmount(input.amountMinor);
    assertValidRate(input.rateE4);
  } catch (cause) {
    throw new LedgerSetupError(cause instanceof Error ? cause.message : 'Invalid opening-balance amount.');
  }

  return database.exclusiveTransaction(async (transaction) => {
    const account = await transaction.get<AccountRow>(ledgerSetupSql.getAccount, { $id: input.accountId });
    if (!account || account.archived_at !== null) throw new LedgerSetupError('The account is unavailable.');
    const count = await transaction.get<CountRow>(ledgerSetupSql.openingBalanceCount, {
      $accountId: input.accountId,
    });
    if (!count || count.count !== 0) throw new LedgerSetupError('This account already has an opening balance.');
    const equivalents = calculateEntryEquivalents(input.amountMinor, account.currency, input.rateE4);
    const timestamp = now();
    const rateOrigin = input.rateSourceId !== null && input.rateSourceId !== undefined ? 'source' : 'manual';
    const transactionResult = await transaction.run(ledgerSetupSql.insertOpeningTransaction, {
      $date: input.date,
      $rateE4: Number(input.rateE4),
      $rateOrigin: rateOrigin,
      $rateSourceId: input.rateSourceId ?? null,
      $rateSourceLabel: input.rateSourceLabel?.trim() || null,
      $rateId: input.rateId ?? null,
      $rateDate: input.rateDate ?? null,
      $timestamp: timestamp,
    });
    const transactionId = toSafeId(transactionResult.lastInsertRowId);
    await transaction.run(ledgerSetupSql.insertOpeningEntry, {
      $transactionId: transactionId,
      $accountId: input.accountId,
      $currency: account.currency,
      $amountMinor: Number(input.amountMinor),
      $usdMinor: Number(equivalents.usdMinor),
      $lbpMinor: Number(equivalents.lbpMinor),
      $memo: input.memo?.trim() || null,
    });
    const row = await transaction.get<OpeningRow>(ledgerSetupSql.getOpeningEntry, {
      $accountId: input.accountId,
    });
    if (!row) throw new LedgerSetupError('The opening balance could not be read back.');
    return transactionId;
  });
}

export async function getOpeningBalance(
  database: DbDriver,
  accountId: number,
): Promise<OpeningBalance | null> {
  const row = await database.get<OpeningRow>(ledgerSetupSql.getOpeningEntry, { $accountId: accountId });
  if (!row) return null;
  return {
    transactionId: row.transaction_id,
    entryId: row.entry_id,
    accountId,
    date: row.date,
    currency: row.currency,
    amountMinor: BigInt(row.amount_minor),
    usdMinor: BigInt(row.usd_minor),
    lbpMinor: BigInt(row.lbp_minor),
    memo: row.memo,
    rateE4: BigInt(row.lbp_per_usd_e4),
    rateOrigin: row.rate_origin,
    rateSourceId: row.rate_source_id,
    rateSourceLabel: row.rate_source_label,
  };
}

export async function updateOpeningBalance(
  database: DbDriver,
  input: OpeningBalanceInput,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  if (!isIsoDate(input.date)) throw new LedgerSetupError('Enter a real opening-balance date.');
  try {
    assertValidEntryAmount(input.amountMinor);
    assertValidRate(input.rateE4);
  } catch (cause) {
    throw new LedgerSetupError(cause instanceof Error ? cause.message : 'Invalid opening-balance amount.');
  }

  await database.exclusiveTransaction(async (transaction) => {
    const account = await transaction.get<AccountRow>(ledgerSetupSql.getAccount, { $id: input.accountId });
    if (!account || account.archived_at !== null) throw new LedgerSetupError('The account is unavailable.');
    const existing = await transaction.get<OpeningRow>(ledgerSetupSql.getOpeningEntry, {
      $accountId: input.accountId,
    });
    if (!existing) throw new LedgerSetupError('This account does not have an opening balance.');
    const equivalents = calculateEntryEquivalents(input.amountMinor, account.currency, input.rateE4);
    const timestamp = now();
    const rateOrigin = input.rateSourceId !== null && input.rateSourceId !== undefined ? 'source' : 'manual';
    const transactionResult = await transaction.run(ledgerSetupSql.updateOpeningTransaction, {
      $transactionId: existing.transaction_id,
      $date: input.date,
      $rateE4: Number(input.rateE4),
      $rateOrigin: rateOrigin,
      $rateSourceId: input.rateSourceId ?? null,
      $rateSourceLabel: input.rateSourceLabel?.trim() || null,
      $rateId: input.rateId ?? null,
      $rateDate: input.rateDate ?? null,
      $timestamp: timestamp,
    });
    if (transactionResult.changes !== 1) throw new LedgerSetupError('The opening balance was not updated.');
    await transaction.run(ledgerSetupSql.updateOpeningEntry, {
      $transactionId: existing.transaction_id,
      $accountId: input.accountId,
      $amountMinor: Number(input.amountMinor),
      $usdMinor: Number(equivalents.usdMinor),
      $lbpMinor: Number(equivalents.lbpMinor),
      $memo: input.memo?.trim() || null,
    });
  });
}

async function validateParent(database: DbDriver, parentId: number | null, kind: CategoryKind): Promise<void> {
  if (parentId === null) return;
  const parent = await database.get<CategoryRow>(categoriesSql.getCategory, { $id: parentId });
  if (!parent || parent.archived_at !== null || parent.kind !== kind) {
    throw new LedgerSetupError('The subcategory parent must be an active category of the same kind.');
  }
}

function validateAccountInput(input: AccountInput): void {
  if (input.name.trim().length === 0) throw new LedgerSetupError('Enter an account name.');
  if (!['cash','bank','card','wallet','savings','other'].includes(input.type)) throw new LedgerSetupError('Choose a supported account type.');
  if (input.currency !== 'USD' && input.currency !== 'LBP') throw new LedgerSetupError('Choose a supported account currency.');
  if (input.sortOrder !== undefined && (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0)) {
    throw new LedgerSetupError('Account sort order must be a non-negative integer.');
  }
}

function validateCategoryInput(input: CategoryInput): void {
  if (input.name.trim().length === 0) throw new LedgerSetupError('Enter a category name.');
  if (input.kind !== 'income' && input.kind !== 'expense') throw new LedgerSetupError('Choose a category kind.');
  if (input.sortOrder !== undefined && (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0)) {
    throw new LedgerSetupError('Category sort order must be a non-negative integer.');
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toSafeId(id: number | bigint): number {
  if (typeof id === 'bigint') {
    if (id < 1n || id > BigInt(Number.MAX_SAFE_INTEGER)) throw new LedgerSetupError('SQLite returned an invalid generated id.');
    return Number(id);
  }
  if (!Number.isSafeInteger(id) || id < 1) throw new LedgerSetupError('SQLite returned an invalid generated id.');
  return id;
}
