import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { listTransactions, type LedgerTransaction } from '@/services/ledgerService';
import {
  AppButton,
  AppText,
  EmptyState,
  errorText,
  IconAction,
  Notice,
  radius,
  SegmentedControl,
  spacing,
  todayIso,
  useContentContainerStyle,
  useDateFormat,
  useFocusData,
  useTokens,
} from '@/ui';
import { TransactionRow } from '@/ui/TransactionRow';

type Filter = 'all' | 'expense' | 'income' | 'transfer';

const matches = (filter: Filter, transaction: LedgerTransaction) => {
  if (filter === 'all') return true;
  if (filter === 'income') return transaction.kind === 'income' || transaction.kind === 'refund';
  return transaction.kind === filter;
};

export default function TransactionsScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const format = useDateFormat();
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await listTransactions(database);
    setError(null);
    return next;
  }, [database]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, refreshing, refresh } = useFocusData(load, onError);

  const sections = useMemo(() => {
    const today = todayIso();
    const groups = new Map<string, LedgerTransaction[]>();
    for (const transaction of data ?? []) {
      if (!matches(filter, transaction)) continue;
      const list = groups.get(transaction.date) ?? [];
      list.push(transaction);
      groups.set(transaction.date, list);
    }
    return [...groups.entries()].map(([date, items]) => ({
      key: date,
      title: date === today ? t('ui.today') : format.date(date),
      data: items,
    }));
  }, [data, filter, format, t]);

  const container = useContentContainerStyle({ gap: 0 });

  const header = (
    <View style={styles.header}>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <AppButton icon="minus" onPress={() => router.push('/transactions/new?kind=expense' as Href)}>
            {t('transactions.addExpense')}
          </AppButton>
        </View>
        <View style={styles.flex}>
          <AppButton variant="tonal" icon="plus" onPress={() => router.push('/transactions/new?kind=income' as Href)}>
            {t('transactions.addIncome')}
          </AppButton>
        </View>
        <IconAction
          icon="swap-horizontal"
          tone="primary"
          accessibilityLabel={t('transactions.transfer')}
          onPress={() => router.push('/transactions/new?kind=transfer' as Href)}
        />
      </View>
      <SegmentedControl
        value={filter}
        onChange={setFilter}
        accessibilityLabel={t('ui.filterTransactions')}
        options={[
          { value: 'all', label: t('ui.all') },
          { value: 'expense', label: t('ui.expenses') },
          { value: 'income', label: t('ui.incomeShort') },
          { value: 'transfer', label: t('ui.transfers') },
        ]}
      />
      {error ? <Notice tone="error" message={error} /> : null}
    </View>
  );

  return (
    <SectionList
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={container}
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[tokens.primary]} tintColor={tokens.primary} />
      }
      ListEmptyComponent={
        data ? (
          <EmptyState
            icon="receipt-text-outline"
            title={filter === 'all' ? t('ui.noTransactions') : t('ui.noMatchingTransactions')}
            message={filter === 'all' ? t('ui.noTransactionsMessage') : undefined}
          />
        ) : undefined
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <AppText variant="label" tone="secondary" style={styles.semibold} accessibilityRole="header">
            {section.title}
          </AppText>
        </View>
      )}
      renderItem={({ item, index, section }) => {
        const first = index === 0;
        const last = index === section.data.length - 1;
        return (
          <View
            style={[
              styles.item,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
              first ? styles.itemFirst : null,
              last ? styles.itemLast : null,
            ]}
          >
            {!first ? <View style={[styles.divider, { backgroundColor: tokens.border }]} /> : null}
            <TransactionRow
              transaction={item}
              showDate={false}
              onPress={() => router.push(`/transactions/${item.id}` as Href)}
            />
          </View>
        );
      }}
    />
  );
}

const BORDER = StyleSheet.hairlineWidth * 2;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  semibold: { fontWeight: '600' },
  header: { gap: spacing.lg, paddingBottom: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: { borderLeftWidth: BORDER, borderRightWidth: BORDER, overflow: 'hidden' },
  itemFirst: { borderTopWidth: BORDER, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  itemLast: { borderBottomWidth: BORDER, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  divider: { height: BORDER, marginStart: 68 },
});
