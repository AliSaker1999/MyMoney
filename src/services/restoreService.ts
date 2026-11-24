import type { DbDriver, SqlValue } from '@/db/driver';
import { restoreSql } from '@/db/sql/restore.sql';
import {
  decryptBackupSnapshot,
  verifyBackupManifest,
  type BackupCryptoProvider,
  type BackupSnapshot,
  BackupError,
} from '@/services/backupService';

export class RestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreError';
  }
}

export async function decryptAndValidateBackup(
  envelope: unknown,
  password: string,
  cryptoProvider: BackupCryptoProvider,
): Promise<BackupSnapshot> {
  try {
    return await decryptBackupSnapshot(envelope, password, cryptoProvider);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new RestoreError('The backup could not be decrypted.');
  }
}

export async function restoreBackupSnapshot(
  database: DbDriver,
  snapshot: BackupSnapshot,
): Promise<void> {
  verifyBackupManifest(snapshot);
  await database.exclusiveTransaction(async (transaction) => {
    await transaction.exec(`
      DELETE FROM debt_movements;
      DELETE FROM debts;
      DELETE FROM goal_contributions;
      DELETE FROM goals;
      DELETE FROM budgets;
      DELETE FROM entries;
      DELETE FROM transactions;
      DELETE FROM categories;
      DELETE FROM accounts;
      DELETE FROM exchange_rates;
      DELETE FROM rate_sources;
      DELETE FROM settings;
      DELETE FROM schema_migrations;
    `);

    await insertRows(transaction, 'schema_migrations', snapshot.tables.schema_migrations, restoreSql.insertMigration);
    await insertRows(transaction, 'rate_sources', snapshot.tables.rate_sources, restoreSql.insertRateSource);
    await insertRows(transaction, 'exchange_rates', snapshot.tables.exchange_rates, restoreSql.insertExchangeRate);
    await insertRows(transaction, 'accounts', snapshot.tables.accounts, restoreSql.insertAccount);
    await insertRows(transaction, 'categories', snapshot.tables.categories, restoreSql.insertCategory);
    await insertRows(transaction, 'transactions', snapshot.tables.transactions, restoreSql.insertTransaction);
    await insertRows(transaction, 'entries', snapshot.tables.entries, restoreSql.insertEntry);
    await insertRows(transaction, 'budgets', snapshot.tables.budgets, restoreSql.insertBudget);
    await insertRows(transaction, 'goals', snapshot.tables.goals, restoreSql.insertGoal);
    await insertRows(transaction, 'goal_contributions', snapshot.tables.goal_contributions, restoreSql.insertGoalContribution);
    await insertRows(transaction, 'debts', snapshot.tables.debts, restoreSql.insertDebt);
    await insertRows(transaction, 'debt_movements', snapshot.tables.debt_movements, restoreSql.insertDebtMovement);
    await insertRows(transaction, 'settings', snapshot.tables.settings, restoreSql.insertSetting);

    await verifyRestoredDatabase(transaction, snapshot);
  });
}

async function insertRows(
  transaction: DbDriver,
  tableName: string,
  rows: readonly Record<string, unknown>[] | undefined,
  sql: string,
): Promise<void> {
  if (!rows) throw new RestoreError(`The backup is missing ${tableName}.`);
  for (const row of rows) {
    const params: Record<string, SqlValue> = {};
    for (const [key, value] of Object.entries(row)) {
      params[`$${key}`] = value as SqlValue;
    }
    await transaction.run(sql, params);
  }
}

async function verifyRestoredDatabase(
  transaction: DbDriver,
  snapshot: BackupSnapshot,
): Promise<void> {
  const integrity = await transaction.all<{ integrity_check: string }>(restoreSql.integrityCheck);
  if (integrity.some((row) => row.integrity_check !== 'ok')) throw new RestoreError('Integrity check failed after restore.');
  const foreignKeys = await transaction.all<object>(restoreSql.foreignKeyCheck);
  if (foreignKeys.length > 0) throw new RestoreError('Foreign-key check failed after restore.');
  const violations = await transaction.all<object>(restoreSql.ledgerViolations);
  if (violations.length > 0) throw new RestoreError('Ledger validation failed after restore.');

  const balances = await transaction.all<{ account_id: number; balance_minor: string }>(restoreSql.accountBalances);
  for (const row of balances) {
    if (snapshot.manifest.accountBalances[String(row.account_id)] !== row.balance_minor) {
      throw new RestoreError('Account balances do not match the backup manifest.');
    }
  }
}
