import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatRate } from '@/domain/money';
import { getReportSnapshot } from '@/services/reportService';
import {
  AppText,
  Card,
  CashFlowColumns,
  categoryIcon,
  Columns,
  EmptyState,
  errorText,
  FadeIn,
  IconTile,
  ListGroup,
  ListRow,
  minorToNumber,
  moneyText,
  Notice,
  RankedBars,
  reportCategoryLabel,
  Screen,
  Section,
  SegmentedControl,
  shiftMonth,
  spacing,
  StatTile,
  todayIso,
  useDateFormat,
  useFocusData,
  useTokens,
} from '@/ui';

type Period = '1' | '3' | '6' | '12';
type Breakdown = 'expense' | 'income';

export default function ReportsScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const format = useDateFormat();
  const [period, setPeriod] = useState<Period>('6');
  const [breakdown, setBreakdown] = useState<Breakdown>('expense');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = todayIso();
    const month = today.slice(0, 7);
    const firstMonth = shiftMonth(month, -(Number(period) - 1));
    const report = await getReportSnapshot(database, `${firstMonth}-01`, today);
    setError(null);
    return { report, month, firstMonth };
  }, [database, period]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, refreshing, refresh } = useFocusData(load, onError);

  const periodControl = (
    <SegmentedControl
      value={period}
      onChange={setPeriod}
      accessibilityLabel={t('ui.period')}
      options={[
        { value: '1', label: t('ui.periodMonth') },
        { value: '3', label: t('ui.periodMonths', { count: 3 }) },
        { value: '6', label: t('ui.periodMonths', { count: 6 }) },
        { value: '12', label: t('ui.periodYear') },
      ]}
    />
  );

  if (!data) {
    return (
      <Screen>
        {periodControl}
        {error ? <Notice tone="error" message={error} /> : null}
      </Screen>
    );
  }

  const { report, month, firstMonth } = data;

  // Fill every month in range so gaps show as empty columns rather than disappearing.
  const months: string[] = [];
  for (let cursor = firstMonth; cursor <= month; cursor = shiftMonth(cursor, 1)) months.push(cursor);
  const byMonth = new Map(report.cashFlow.map((row) => [row.month, row]));
  const columns = months.map((key) => {
    const row = byMonth.get(key);
    const income = row?.incomeUsdMinor ?? 0n;
    const spendingRaw = (row?.expenseUsdMinor ?? 0n) - (row?.refundUsdMinor ?? 0n);
    const spending = spendingRaw > 0n ? spendingRaw : 0n;
    return {
      key,
      label: format.month(key),
      income: minorToNumber(income, 'USD'),
      expense: minorToNumber(spending, 'USD'),
      incomeText: moneyText(income, 'USD'),
      expenseText: moneyText(spending, 'USD'),
      incomeMinor: income,
      spendingMinor: spending,
    };
  });
  const totalIncome = columns.reduce((sum, item) => sum + item.incomeMinor, 0n);
  const totalSpending = columns.reduce((sum, item) => sum + item.spendingMinor, 0n);
  const net = totalIncome - totalSpending;
  const savingsRate =
    totalIncome > 0n ? Math.round((minorToNumber(net, 'USD') / minorToNumber(totalIncome, 'USD')) * 100) : null;

  const categories = report.categoryBreakdown
    .filter((item) => item.kind === breakdown)
    .map((item) => {
      const signed = breakdown === 'expense' ? -item.usdMinor : item.usdMinor;
      return {
        key: String(item.categoryId ?? item.label),
        label: reportCategoryLabel(t, item.label),
        value: minorToNumber(signed, 'USD'),
        valueText: moneyText(signed, 'USD'),
        icon: categoryIcon(item.label, breakdown),
      };
    })
    .filter((item) => item.value > 0);

  const kpis = (
    <FadeIn index={1}>
      <View style={styles.kpis}>
        <StatTile label={t('ui.income')} value={moneyText(totalIncome, 'USD')} icon="arrow-bottom-left" tint="positive" />
        <StatTile label={t('ui.spending')} value={moneyText(totalSpending, 'USD')} icon="arrow-top-right" tint="warning" />
        <StatTile
          label={t('ui.net')}
          value={moneyText(net, 'USD', { sign: net > 0n ? 'plus' : 'auto' })}
          valueTone={net < 0n ? 'negative' : net > 0n ? 'positive' : 'default'}
          icon="scale-balance"
          tint="info"
        />
        <StatTile
          label={t('ui.savingsRate')}
          value={savingsRate === null ? '—' : `${savingsRate}%`}
          valueTone={savingsRate !== null && savingsRate < 0 ? 'negative' : 'default'}
          icon="piggy-bank-outline"
          tint="primary"
        />
      </View>
    </FadeIn>
  );

  const cashFlow = (
    <FadeIn index={2}>
      <Section title={t('ui.cashFlow')} caption={t('ui.usdEquivalentNote')}>
        <Card>
          {totalIncome === 0n && totalSpending === 0n ? (
            <EmptyState compact icon="chart-bar" title={t('ui.noActivityInPeriod')} />
          ) : (
            <CashFlowColumns data={columns} incomeLabel={t('ui.income')} expenseLabel={t('ui.spending')} />
          )}
        </Card>
      </Section>
    </FadeIn>
  );

  const breakdownSection = (
    <FadeIn index={3}>
      <Section title={t('ui.byCategory')}>
        <Card>
          <SegmentedControl
            value={breakdown}
            onChange={setBreakdown}
            accessibilityLabel={t('ui.byCategory')}
            options={[
              { value: 'expense', label: t('transactions.expense') },
              { value: 'income', label: t('transactions.income') },
            ]}
          />
          {categories.length === 0 ? (
            <EmptyState
              compact
              icon="shape-outline"
              title={breakdown === 'expense' ? t('reports.noExpenseData') : t('ui.noIncomeData')}
            />
          ) : (
            <RankedBars
              data={categories}
              color={breakdown === 'expense' ? tokens.seriesExpense : tokens.seriesIncome}
              otherLabel={t('ui.otherCategories')}
            />
          )}
        </Card>
      </Section>
    </FadeIn>
  );

  const netWorth = (
    <FadeIn index={4}>
      <Section title={t('reports.netWorthNative')}>
        <ListGroup>
          {(report.netWorthNative.length > 0
            ? report.netWorthNative
            : [{ currency: 'USD' as const, balanceMinor: 0n }]
          ).map((item) => (
            <ListRow
              key={item.currency}
              title={t(`currency.${item.currency}`)}
              subtitle={item.currency}
              leading={<IconTile icon={item.currency === 'USD' ? 'currency-usd' : 'cash-multiple'} tint="primary" />}
              trailing={
                <AppText variant="bodyStrong" numeric>
                  {moneyText(item.balanceMinor, item.currency)}
                </AppText>
              }
            />
          ))}
        </ListGroup>
        {report.netWorthRate && report.netWorthRateDate ? (
          <AppText variant="caption" tone="muted" numeric>
            {`${t('reports.rateAsOf')} ${format.date(report.netWorthRateDate)}: ${formatRate(report.netWorthRate)}`}
          </AppText>
        ) : (
          <Notice tone="warning" message={t('reports.noRateGap')} />
        )}
      </Section>
    </FadeIn>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <FadeIn index={0}>{periodControl}</FadeIn>
      {error ? <Notice tone="error" message={error} /> : null}
      {kpis}
      <Columns
        left={cashFlow}
        right={
          <>
            {breakdownSection}
            {netWorth}
          </>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
