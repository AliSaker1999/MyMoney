import { Redirect, router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { convertLbpToUsdMinor, formatRate } from '@/domain/money';
import { getBudgetsByMonth } from '@/services/budgetService';
import { getDashboard } from '@/services/dashboardService';
import { listAccounts } from '@/services/ledgerSetupService';
import { isOnboardingComplete } from '@/services/onboardingService';
import { getReportSnapshot } from '@/services/reportService';
import { spikeEnabled } from '@/spike/enabled';
import {
  accountIcon,
  Amount,
  AppButton,
  AppText,
  Badge,
  Card,
  categoryIcon,
  categoryLabel,
  Columns,
  EmptyState,
  errorText,
  FadeIn,
  IconAction,
  IconTile,
  ListGroup,
  ListRow,
  minorToNumber,
  moneyText,
  Notice,
  PressableScale,
  ProgressBar,
  progressTone,
  Screen,
  Section,
  shiftMonth,
  spacing,
  SplitBar,
  todayIso,
  useDateFormat,
  useFocusData,
  useResponsive,
  useTokens,
  type Tint,
} from '@/ui';
import { TransactionRow } from '@/ui/TransactionRow';

const go = (href: string) => router.push(href as Href);

export default function DashboardScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const format = useDateFormat();
  const { isWide } = useResponsive();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const complete = await isOnboardingComplete(database);
    if (!complete) return { complete: false as const };
    const today = todayIso();
    const month = today.slice(0, 7);
    const [dashboard, report, budgets, accounts] = await Promise.all([
      getDashboard(database, `${month}-01`, today, 6),
      getReportSnapshot(database, `${shiftMonth(month, -5)}-01`, today),
      getBudgetsByMonth(database, month),
      listAccounts(database),
    ]);
    setError(null);
    return { complete: true as const, today, month, dashboard, report, budgets, accounts };
  }, [database]);

  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, refreshing, refresh } = useFocusData(load, onError);

  if (data && !data.complete) return <Redirect href={'/onboarding' as Href} />;

  if (!data) {
    return (
      <Screen edgeTop>
        {error ? <Notice tone="error" message={error} /> : <DashboardSkeleton />}
      </Screen>
    );
  }

  const { dashboard, report, budgets, accounts, month, today } = data;

  // ---- Net worth (native currencies, plus a USD-equivalent total when a preferred rate exists).
  const usdNet = report.netWorthNative.find((item) => item.currency === 'USD')?.balanceMinor ?? 0n;
  const lbpNet = report.netWorthNative.find((item) => item.currency === 'LBP')?.balanceMinor ?? 0n;
  const combined = report.netWorthRate ? usdNet + convertLbpToUsdMinor(lbpNet, report.netWorthRate) : null;

  // ---- This month, in USD equivalent.
  const sumKind = (kind: 'income' | 'expense' | 'refund') =>
    dashboard.flows.filter((flow) => flow.kind === kind).reduce((total, flow) => total + flow.usdMinor, 0n);
  const income = sumKind('income');
  const spending = (() => {
    const net = -sumKind('expense') - sumKind('refund');
    return net > 0n ? net : 0n;
  })();
  const net = income - spending;
  const spentShare = income > 0n ? Math.round((minorToNumber(spending, 'USD') / minorToNumber(income, 'USD')) * 100) : null;

  const activeAccounts = accounts.filter((account) => account.archivedAt === null);
  const topBudgets = [...budgets].sort((a, b) => b.spentPercentage - a.spentPercentage).slice(0, 3);
  const overBudgetCount = budgets.filter((budget) => budget.isOverBudget).length;

  const header = (
    <FadeIn index={0}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="label" tone="muted">
            {format.date(today)}
          </AppText>
          <AppText variant="h1" accessibilityRole="header">
            {t('app.title')}
          </AppText>
        </View>
        <IconAction icon="shield-lock-outline" onPress={() => go('/settings/security')} accessibilityLabel={t('security.settings')} />
      </View>
    </FadeIn>
  );

  const hero = (
    <FadeIn index={1}>
      <Card variant="hero" style={styles.hero}>
        <View style={styles.heroTop}>
          <AppText variant="overline" tone="heroMuted" uppercase>
            {t('ui.netWorth')}
          </AppText>
          <Badge label={t('ui.offlineEncrypted')} tint="hero" icon="lock-outline" />
        </View>
        <AppText variant="display" tone="hero" numeric numberOfLines={1} adjustsFontSizeToFit>
          {moneyText(usdNet, 'USD')}
        </AppText>
        <AppText variant="title" tone="heroMuted" numeric numberOfLines={1}>
          {moneyText(lbpNet, 'LBP')}
        </AppText>
        <View style={[styles.heroFooter, { borderTopColor: tokens.heroChip }]}>
          {combined !== null && report.netWorthRate ? (
            <>
              <AppText variant="label" tone="hero" numeric style={styles.semibold}>
                {t('ui.combinedTotal', { amount: moneyText(combined, 'USD') })}
              </AppText>
              <AppText variant="caption" tone="heroMuted" numeric>
                {t('ui.atRate', {
                  rate: formatRate(report.netWorthRate),
                  date: format.shortDate(report.netWorthRateDate),
                })}
              </AppText>
            </>
          ) : (
            <PressableScale onPress={() => go('/rates')} accessibilityRole="link">
              <AppText variant="label" tone="heroMuted">
                {t('ui.noRateForTotal')}
              </AppText>
            </PressableScale>
          )}
        </View>
      </Card>
    </FadeIn>
  );

  const monthCard = (
    <FadeIn index={2}>
      <Card>
        <View style={styles.rowBetween}>
          <AppText variant="title">{t('ui.thisMonth')}</AppText>
          <AppText variant="label" tone="muted">
            {format.month(month)}
          </AppText>
        </View>
        <View style={styles.metrics}>
          <Metric label={t('ui.income')} value={moneyText(income, 'USD')} color={tokens.seriesIncome} />
          <Metric label={t('ui.spending')} value={moneyText(spending, 'USD')} color={tokens.seriesExpense} />
          <Metric
            label={t('ui.net')}
            value={moneyText(net, 'USD', { sign: net > 0n ? 'plus' : 'auto' })}
            tone={net < 0n ? 'negative' : net > 0n ? 'positive' : 'default'}
          />
        </View>
        <SplitBar
          a={minorToNumber(income, 'USD')}
          b={minorToNumber(spending, 'USD')}
          colorA={tokens.seriesIncome}
          colorB={tokens.seriesExpense}
        />
        <AppText variant="caption" tone="muted">
          {spentShare !== null ? t('ui.spentShareOfIncome', { percent: spentShare }) : t('ui.usdEquivalentNote')}
        </AppText>
      </Card>
    </FadeIn>
  );

  const quickActions = (
    <FadeIn index={3}>
      <View style={styles.actions}>
        <QuickAction icon="arrow-top-right" label={t('transactions.expense')} onPress={() => go('/transactions/new?kind=expense')} tint="neutral" />
        <QuickAction icon="arrow-bottom-left" label={t('transactions.income')} onPress={() => go('/transactions/new?kind=income')} tint="positive" />
        <QuickAction icon="swap-horizontal" label={t('transactions.transfer')} onPress={() => go('/transactions/new?kind=transfer')} tint="info" />
        <QuickAction icon="currency-usd" label={t('ui.rates')} onPress={() => go('/rates')} tint="warning" />
      </View>
    </FadeIn>
  );

  const accountsSection = (
    <FadeIn index={4}>
      <Section title={t('accounts.manageTitle')} action={{ label: t('ui.manage'), onPress: () => go('/accounts') }}>
        {activeAccounts.length === 0 ? (
          <EmptyState compact icon="wallet-plus-outline" title={t('ui.noAccounts')} />
        ) : (
          <ListGroup>
            {activeAccounts.map((account) => (
              <ListRow
                key={account.id}
                title={account.name}
                subtitle={[t(`account.type.${account.type}`), account.includeInNetWorth ? null : t('ui.notInNetWorth')]
                  .filter(Boolean)
                  .join(' · ')}
                leading={<IconTile icon={accountIcon(account.type)} tint="primary" />}
                trailing={<Amount minor={account.balanceMinor} currency={account.currency} />}
                trailingCaption={account.currency}
                onPress={() => go(`/accounts/${account.id}`)}
                accessibilityHint={t('accounts.ledger')}
              />
            ))}
          </ListGroup>
        )}
      </Section>
    </FadeIn>
  );

  const budgetsSection = (
    <FadeIn index={5}>
      <Section
        title={t('ui.budgetsThisMonth')}
        caption={overBudgetCount > 0 ? t('ui.overBudgetCount', { count: overBudgetCount }) : undefined}
        action={{ label: t('ui.seeAll'), onPress: () => go('/budgets') }}
      >
        {topBudgets.length === 0 ? (
          <EmptyState
            compact
            icon="chart-donut"
            title={t('ui.noBudgets')}
            message={t('ui.noBudgetsMessage')}
            action={
              <AppButton variant="tonal" size="sm" onPress={() => go('/budgets')}>
                {t('budgets.addBudget')}
              </AppButton>
            }
          />
        ) : (
          <Card>
            {topBudgets.map((budget, index) => {
              const spent = budget.spentUsdMinor + budget.spentLbpMinor;
              const ratio = budget.spentPercentage / 100;
              const name = categoryLabel(t, budget.categoryName, budget.categoryBuiltinKey);
              return (
                <View key={budget.id} style={[styles.budget, index > 0 ? { borderTopColor: tokens.border, ...styles.budgetDivider } : null]}>
                  <View style={styles.budgetHeader}>
                    <IconTile icon={categoryIcon(budget.categoryBuiltinKey, 'expense')} tint={progressTint(ratio)} size={32} />
                    <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                      {name}
                    </AppText>
                    <AppText variant="label" tone={budget.isOverBudget ? 'negative' : 'secondary'} numeric>
                      {`${Math.round(budget.spentPercentage)}%`}
                    </AppText>
                  </View>
                  <ProgressBar ratio={ratio} accessibilityLabel={name} />
                  <AppText variant="caption" tone="muted" numeric>
                    {t('ui.spentOf', {
                      spent: moneyText(spent, budget.currency),
                      total: moneyText(budget.amountMinor, budget.currency),
                    })}
                  </AppText>
                </View>
              );
            })}
          </Card>
        )}
      </Section>
    </FadeIn>
  );

  const recentSection = (
    <FadeIn index={6}>
      <Section title={t('ui.recentActivity')} action={{ label: t('ui.seeAll'), onPress: () => go('/transactions') }}>
        {dashboard.recentTransactions.length === 0 ? (
          <EmptyState
            compact
            icon="receipt-text-outline"
            title={t('ui.noTransactions')}
            message={t('ui.noTransactionsMessage')}
            action={
              <AppButton variant="primary" size="sm" icon="plus" onPress={() => go('/transactions/new?kind=expense')}>
                {t('transactions.addExpense')}
              </AppButton>
            }
          />
        ) : (
          <ListGroup>
            {dashboard.recentTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onPress={() => go(`/transactions/${transaction.id}`)}
              />
            ))}
          </ListGroup>
        )}
      </Section>
    </FadeIn>
  );

  return (
    <Screen edgeTop refreshing={refreshing} onRefresh={refresh}>
      {header}
      {error ? <Notice tone="error" message={error} /> : null}
      <Columns
        left={
          <>
            {hero}
            {quickActions}
            {monthCard}
            {isWide ? budgetsSection : null}
          </>
        }
        right={
          <>
            {isWide ? null : budgetsSection}
            {accountsSection}
            {recentSection}
          </>
        }
      />
      {spikeEnabled ? (
        <AppButton variant="secondary" testID="open-spike" onPress={() => go('/spike')}>
          {t('app.openSpike')}
        </AppButton>
      ) : null}
    </Screen>
  );
}

function progressTint(ratio: number): Tint {
  const tone = progressTone(ratio);
  return tone === 'primary' ? 'primary' : tone;
}

function Metric({
  label,
  value,
  color,
  tone,
}: {
  label: string;
  value: string;
  color?: string;
  tone?: 'positive' | 'negative' | 'default';
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabel}>
        {color ? <View style={[styles.swatch, { backgroundColor: color }]} /> : null}
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText variant="title" numeric tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </View>
  );
}

function QuickAction({ icon, label, onPress, tint }: { icon: string; label: string; onPress: () => void; tint: Tint }) {
  const tokens = useTokens();
  return (
    <View style={styles.action}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.actionInner, { backgroundColor: tokens.surface, borderColor: tokens.border }]}
      >
        <IconTile icon={icon} tint={tint} size={36} />
        <AppText variant="caption" numberOfLines={1} style={styles.semibold}>
          {label}
        </AppText>
      </PressableScale>
    </View>
  );
}

function DashboardSkeleton() {
  const tokens = useTokens();
  const block = (height: number, key: string) => (
    <View key={key} style={{ height, borderRadius: 16, backgroundColor: tokens.surfaceMuted }} />
  );
  return (
    <View style={{ gap: spacing.xl }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {block(48, 'a')}
      {block(176, 'b')}
      {block(84, 'c')}
      {block(140, 'd')}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  semibold: { fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hero: { gap: spacing.xs, paddingVertical: spacing.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  heroFooter: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  metrics: { flexDirection: 'row', gap: spacing.md },
  metric: { flex: 1, minWidth: 0, gap: 2 },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
  actionInner: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  budget: { gap: spacing.sm },
  budgetDivider: { borderTopWidth: StyleSheet.hairlineWidth * 2, paddingTop: spacing.md },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
