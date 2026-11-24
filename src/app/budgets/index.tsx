import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { parseMoney, type Currency } from '@/domain/money';
import { createBudget, deleteBudget, getBudgetsByMonth, type BudgetExpense } from '@/services/budgetService';
import { listCategories, type Category } from '@/services/ledgerSetupService';
import {
  AppButton,
  AppText,
  Badge,
  Card,
  categoryIcon,
  categoryLabel,
  ChoiceChips,
  Composer,
  ConfirmDialog,
  EmptyState,
  errorText,
  FadeIn,
  Field,
  IconAction,
  IconTile,
  moneyText,
  Notice,
  ProgressBar,
  progressTone,
  Screen,
  Section,
  SegmentedControl,
  shiftMonth,
  spacing,
  todayIso,
  useDateFormat,
  useFocusData,
  type Tint,
} from '@/ui';

const currentMonth = () => todayIso().slice(0, 7);

export default function BudgetsScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const format = useDateFormat();

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [composerOpen, setComposerOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogBudgetId, setDeleteDialogBudgetId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [categories, budgets] = await Promise.all([
      listCategories(database),
      getBudgetsByMonth(database, selectedMonth),
    ]);
    setError(null);
    return { categories, budgets };
  }, [database, selectedMonth]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, reload } = useFocusData(load, onError);

  const categories: Category[] = data?.categories ?? [];
  const budgetsByMonth: BudgetExpense[] = data?.budgets ?? [];
  const expenseCategories = categories.filter((c) => c.kind === 'expense' && !c.archivedAt);

  const addBudget = async () => {
    if (!categoryId || !amount) {
      setError(t('budgets.categoryRequired'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const amountMinor = parseMoney(amount, currency);
      await createBudget(database, {
        categoryId,
        currency,
        amountMinor,
        startMonth,
        endMonth: endMonth || null,
      });
      setCategoryId(null);
      setAmount('');
      setStartMonth(currentMonth());
      setEndMonth('');
      setComposerOpen(false);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteDialogBudgetId === null) return;
    setError(null);
    setLoading(true);
    try {
      await deleteBudget(database, deleteDialogBudgetId);
      setDeleteDialogBudgetId(null);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const spentOf = (item: BudgetExpense) => item.spentUsdMinor + item.spentLbpMinor;
  const totals = (['USD', 'LBP'] as const)
    .map((code) => {
      const items = budgetsByMonth.filter((item) => item.currency === code);
      const budgeted = items.reduce((sum, item) => sum + item.amountMinor, 0n);
      const spent = items.reduce((sum, item) => sum + spentOf(item), 0n);
      return { code, count: items.length, budgeted, spent };
    })
    .filter((item) => item.count > 0);
  const isCurrent = selectedMonth === currentMonth();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('budgets.manageTitle') }} />

      <Card style={styles.monthCard}>
        <IconAction
          icon="chevron-left"
          accessibilityLabel={`${t('common.previous')}: ${format.month(shiftMonth(selectedMonth, -1))}`}
          onPress={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
        />
        <View style={styles.monthLabel} accessible accessibilityLabel={format.month(selectedMonth)}>
          <AppText variant="h2" align="center">{format.month(selectedMonth)}</AppText>
          {!isCurrent ? (
            <AppButton variant="ghost" size="sm" onPress={() => setSelectedMonth(currentMonth())} compact>
              {t('ui.thisMonth')}
            </AppButton>
          ) : (
            <AppText variant="caption" tone="muted" align="center">{t('ui.thisMonth')}</AppText>
          )}
        </View>
        <IconAction
          icon="chevron-right"
          accessibilityLabel={`${t('common.next')}: ${format.month(shiftMonth(selectedMonth, 1))}`}
          onPress={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
        />
      </Card>

      {totals.map((total) => {
        const ratio = total.budgeted > 0n ? Number((total.spent * 1000n) / total.budgeted) / 1000 : 0;
        return (
          <FadeIn key={total.code}>
            <Card>
              <View style={styles.rowBetween}>
                <AppText variant="label" tone="secondary">{t('ui.totalBudgeted', { currency: total.code })}</AppText>
                <AppText variant="label" tone={ratio > 1 ? 'negative' : 'secondary'} numeric>{`${Math.round(ratio * 100)}%`}</AppText>
              </View>
              <AppText variant="h2" numeric>
                {t('ui.spentOf', { spent: moneyText(total.spent, total.code), total: moneyText(total.budgeted, total.code) })}
              </AppText>
              <ProgressBar ratio={ratio} height={10} accessibilityLabel={t('ui.totalBudgeted', { currency: total.code })} />
            </Card>
          </FadeIn>
        );
      })}

      <Composer
        open={composerOpen}
        onToggle={setComposerOpen}
        openLabel={t('budgets.addBudget')}
        closeLabel={t('common.cancel')}
        title={t('budgets.addBudget')}
      >
        <AppText variant="label" tone="secondary">{t('budgets.category')}</AppText>
        {expenseCategories.length > 0 ? (
          <ChoiceChips
            value={categoryId === null ? null : String(categoryId)}
            onChange={(value) => setCategoryId(value ? Number(value) : null)}
            accessibilityLabel={t('budgets.category')}
            options={expenseCategories.map((cat) => ({
              value: String(cat.id),
              label: categoryLabel(t, cat.name, cat.builtinKey),
              icon: categoryIcon(cat.builtinKey, 'expense'),
            }))}
          />
        ) : (
          <Notice tone="warning" message={t('budgets.categoryRequired')} />
        )}
        <SegmentedControl
          value={currency}
          onChange={setCurrency}
          accessibilityLabel={t('budgets.currency')}
          options={[
            { value: 'USD', label: t('currency.USD') },
            { value: 'LBP', label: t('currency.LBP') },
          ]}
        />
        <Field
          label={t('budgets.amount')}
          accessibilityHint={t('ui.amountHint')}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          icon="cash"
        />
        <View style={styles.twoUp}>
          <View style={styles.flex}>
            <Field label={t('budgets.startMonth')} value={startMonth} onChangeText={setStartMonth} placeholder="YYYY-MM" />
          </View>
          <View style={styles.flex}>
            <Field label={t('ui.endMonthOptional')} value={endMonth} onChangeText={setEndMonth} placeholder="YYYY-MM" />
          </View>
        </View>
        <AppButton
          accessibilityHint={t('ui.createBudgetHint')}
          onPress={() => void addBudget()}
          disabled={loading || !categoryId || !amount}
          loading={loading}
        >
          {t('budgets.addBudget')}
        </AppButton>
      </Composer>

      {error ? <Notice tone="error" message={error} /> : null}

      <Section title={t('ui.categoryBudgets')}>
        {budgetsByMonth.length === 0 ? (
          <EmptyState icon="chart-donut" title={t('budgets.noActiveBudgets')} message={t('ui.noBudgetsMessage')} />
        ) : (
          budgetsByMonth.map((item, index) => {
            const spent = spentOf(item);
            const ratio = item.spentPercentage / 100;
            const tone = progressTone(ratio);
            const tint: Tint = tone === 'primary' ? 'primary' : tone;
            const name = categoryLabel(t, item.categoryName, item.categoryBuiltinKey);
            const remaining = item.amountMinor - spent;
            return (
              <FadeIn key={item.id} index={index}>
                <Card
                  onPress={() => router.push(`/budgets/${item.id}` as Href)}
                  accessibilityLabel={`${name}, ${Math.round(item.spentPercentage)}%`}
                  accessibilityHint={t('budgets.edit')}
                >
                  <View style={styles.budgetHeader}>
                    <IconTile icon={categoryIcon(item.categoryBuiltinKey, 'expense')} tint={tint} />
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong" numberOfLines={1}>{name}</AppText>
                      <AppText variant="label" tone="muted" numeric>
                        {t('ui.spentOf', { spent: moneyText(spent, item.currency), total: moneyText(item.amountMinor, item.currency) })}
                      </AppText>
                    </View>
                    <IconAction
                      icon="trash-can-outline"
                      accessibilityLabel={`${t('budgets.delete')}: ${name}`}
                      onPress={() => setDeleteDialogBudgetId(item.id)}
                    />
                  </View>
                  <ProgressBar ratio={ratio} accessibilityLabel={name} />
                  <View style={styles.rowBetween}>
                    {item.isOverBudget || item.spentPercentage > 100 ? (
                      <Badge
                        tint="negative"
                        icon="alert-circle-outline"
                        label={t('budgets.overBudget', { amount: moneyText(spent - item.amountMinor, item.currency) })}
                      />
                    ) : (
                      <AppText variant="label" tone={tone === 'warning' ? 'warning' : 'secondary'} numeric>
                        {t('ui.amountLeft', { amount: moneyText(remaining, item.currency) })}
                      </AppText>
                    )}
                    <AppText variant="label" tone="muted" numeric>
                      {t('budgets.percentage', { percent: Math.round(item.spentPercentage) })}
                    </AppText>
                  </View>
                </Card>
              </FadeIn>
            );
          })
        )}
      </Section>

      <ConfirmDialog
        visible={deleteDialogBudgetId !== null}
        icon="trash-can-outline"
        title={t('budgets.deleteConfirmation')}
        confirmLabel={t('budgets.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => setDeleteDialogBudgetId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  monthCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  monthLabel: { flex: 1, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  budgetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  twoUp: { flexDirection: 'row', gap: spacing.sm },
});
