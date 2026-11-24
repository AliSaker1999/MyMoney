import type { DbDriver } from '@/db/driver';
import { dashboardSql } from '@/db/sql/dashboard.sql';
import type { Currency } from '@/domain/money';
import { getTransaction, type LedgerTransaction } from '@/services/ledgerService';

export interface DashboardAccountBalance {
  id: number;
  name: string;
  currency: Currency;
  includeInNetWorth: boolean;
  balanceMinor: bigint;
}

export interface PeriodFlow {
  kind: 'income' | 'expense' | 'refund';
  currency: Currency;
  usdMinor: bigint;
  lbpMinor: bigint;
}

export interface DashboardSummary {
  balances: DashboardAccountBalance[];
  flows: PeriodFlow[];
  recentTransactions: LedgerTransaction[];
}

export interface DataHealthIssue {
  transactionId: number | null;
  rule: string;
}

interface BalanceRow {
  id: number;
  name: string;
  currency: Currency;
  include_in_net_worth: number;
  balance_minor: string;
}

interface FlowRow {
  kind: 'income' | 'expense' | 'refund';
  currency: Currency;
  usd_minor: string;
  lbp_minor: string;
}

interface TransactionIdRow { id: number }
interface ViolationRow { transaction_id: number; rule: string }
interface IntegrityRow { integrity_check: string }
interface ForeignKeyRow { table: string; rowid: number; parent: string; fkid: number }

export async function getDashboard(
  database: DbDriver,
  fromDate: string,
  toDate: string,
  recentLimit = 10,
): Promise<DashboardSummary> {
  const [balanceRows, flowRows, transactionRows] = await Promise.all([
    database.all<BalanceRow>(dashboardSql.accountBalances),
    database.all<FlowRow>(dashboardSql.periodFlows, { $fromDate: fromDate, $toDate: toDate }),
    database.all<TransactionIdRow>(dashboardSql.recentTransactions, { $limit: recentLimit }),
  ]);
  const recentTransactions: LedgerTransaction[] = [];
  for (const row of transactionRows) {
    const transaction = await getTransaction(database, row.id);
    if (transaction) recentTransactions.push(transaction);
  }
  return {
    balances: balanceRows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency,
      includeInNetWorth: row.include_in_net_worth === 1,
      balanceMinor: BigInt(row.balance_minor),
    })),
    flows: flowRows.map((row) => ({
      kind: row.kind,
      currency: row.currency,
      usdMinor: BigInt(row.usd_minor),
      lbpMinor: BigInt(row.lbp_minor),
    })),
    recentTransactions,
  };
}

export async function getAccountLedger(database: DbDriver, accountId: number): Promise<LedgerTransaction[]> {
  const rows = await database.all<TransactionIdRow>(dashboardSql.accountLedger, { $accountId: accountId });
  const transactions: LedgerTransaction[] = [];
  for (const row of rows) {
    const transaction = await getTransaction(database, row.id);
    if (transaction) transactions.push(transaction);
  }
  return transactions;
}

export async function runDataHealth(database: DbDriver): Promise<DataHealthIssue[]> {
  const integrity = await database.all<IntegrityRow>(dashboardSql.integrityCheck);
  const foreignKeys = await database.all<ForeignKeyRow>(dashboardSql.foreignKeyCheck);
  const violations = await database.all<ViolationRow>(dashboardSql.ledgerViolations);
  const issues: DataHealthIssue[] = [];
  for (const row of integrity) {
    if (row.integrity_check !== 'ok') issues.push({ transactionId: null, rule: `integrity_check: ${row.integrity_check}` });
  }
  for (const row of foreignKeys) {
    issues.push({
      transactionId: null,
      rule: `foreign_key_check: ${row.table}/${row.parent}/${row.rowid}`,
    });
  }
  for (const row of violations) issues.push({ transactionId: row.transaction_id, rule: row.rule });
  return issues;
}
