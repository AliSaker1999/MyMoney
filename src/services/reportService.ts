import type { DbDriver } from '@/db/driver';
import { reportsSql } from '@/db/sql/reports.sql';
import type { Currency } from '@/domain/money';

export interface CashFlowMonth {
  month: string;
  incomeUsdMinor: bigint;
  refundUsdMinor: bigint;
  expenseUsdMinor: bigint;
  incomeLbpMinor: bigint;
  refundLbpMinor: bigint;
  expenseLbpMinor: bigint;
}

export interface CategoryAmount {
  categoryId: number | null;
  label: string;
  kind: 'income' | 'expense';
  usdMinor: bigint;
  lbpMinor: bigint;
}

export interface NativeNetWorth {
  currency: Currency;
  balanceMinor: bigint;
}

export interface ReportSnapshot {
  cashFlow: CashFlowMonth[];
  categoryBreakdown: CategoryAmount[];
  netWorthNative: NativeNetWorth[];
  netWorthRate: bigint | null;
  netWorthRateDate: string | null;
}

interface CashRow {
  month: string;
  income_usd: string;
  refund_usd: string;
  expense_usd: string;
  income_lbp: string;
  refund_lbp: string;
  expense_lbp: string;
}
interface CategoryRow {
  category_id: number | null;
  label: string;
  kind: 'income' | 'expense';
  usd_minor: string;
  lbp_minor: string;
}
interface NetRow { currency: Currency; balance_minor: string }
interface RateRow { lbp_per_usd_e4: number; effective_date: string }

export async function getReportSnapshot(
  database: DbDriver,
  fromDate: string,
  toDate: string,
): Promise<ReportSnapshot> {
  const [cashRows, categoryRows, netRows, rate] = await Promise.all([
    database.all<CashRow>(reportsSql.cashFlowByMonth, { $fromDate: fromDate, $toDate: toDate }),
    database.all<CategoryRow>(reportsSql.categoryBreakdown, { $fromDate: fromDate, $toDate: toDate }),
    database.all<NetRow>(reportsSql.netWorthNative),
    database.get<RateRow>(reportsSql.latestPreferredRate, { $date: toDate }),
  ]);
  return {
    cashFlow: cashRows.map((row) => ({
      month: row.month,
      incomeUsdMinor: BigInt(row.income_usd),
      refundUsdMinor: BigInt(row.refund_usd),
      expenseUsdMinor: BigInt(row.expense_usd),
      incomeLbpMinor: BigInt(row.income_lbp),
      refundLbpMinor: BigInt(row.refund_lbp),
      expenseLbpMinor: BigInt(row.expense_lbp),
    })),
    categoryBreakdown: categoryRows.map((row) => ({
      categoryId: row.category_id,
      label: row.label,
      kind: row.kind,
      usdMinor: BigInt(row.usd_minor),
      lbpMinor: BigInt(row.lbp_minor),
    })),
    netWorthNative: netRows.map((row) => ({
      currency: row.currency,
      balanceMinor: BigInt(row.balance_minor),
    })),
    netWorthRate: rate ? BigInt(rate.lbp_per_usd_e4) : null,
    netWorthRateDate: rate?.effective_date ?? null,
  };
}
