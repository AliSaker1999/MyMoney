import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatMoney, parseMoney } from '@/domain/money';
import { deleteBudget, getBudget, updateBudget, type Budget } from '@/services/budgetService';
import {
  AppButton,
  AppText,
  Card,
  categoryIcon,
  categoryLabel,
  ConfirmDialog,
  Divider,
  errorText,
  Field,
  IconTile,
  KeyValue,
  Notice,
  Screen,
  Section,
  spacing,
  useDateFormat,
} from '@/ui';

export default function EditBudgetScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const format = useDateFormat();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [amount, setAmount] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const budgetId = Number(id);
    void getBudget(database, budgetId)
      .then((next) => {
        if (!next) {
          setError(t('budgets.notFound'));
          return;
        }
        setBudget(next);
        setAmount(formatMoney(next.amountMinor, next.currency));
        setEndMonth(next.endMonth ?? '');
      })
      .catch((cause: unknown) => setError(errorText(cause, t('common.error'))));
  }, [database, id, t]);

  const save = async () => {
    if (!budget) return;
    try {
      const amountMinor = parseMoney(amount, budget.currency);
      await updateBudget(database, budget.id, {
        categoryId: budget.categoryId,
        currency: budget.currency,
        amountMinor,
        startMonth: budget.startMonth,
        endMonth: endMonth || null,
      });
      router.back();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    }
  };

  const remove = async () => {
    if (!budget) return;
    setConfirmDelete(false);
    try {
      await deleteBudget(database, budget.id);
      router.back();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    }
  };

  const name = budget ? categoryLabel(t, budget.categoryName, budget.categoryBuiltinKey) : '';

  return (
    <Screen>
      <Stack.Screen options={{ title: t('budgets.edit') }} />
      {error ? <Notice tone="error" message={error} /> : null}
      {budget ? (
        <>
          <Card>
            <View style={styles.header}>
              <IconTile icon={categoryIcon(budget.categoryBuiltinKey, 'expense')} size={48} />
              <View style={styles.flex}>
                <AppText variant="h2" numberOfLines={1}>{name}</AppText>
                <AppText variant="label" tone="muted">{t(`currency.${budget.currency}`)}</AppText>
              </View>
            </View>
            <Divider />
            <KeyValue label={t('budgets.startMonth')} value={format.month(budget.startMonth)} />
            <KeyValue label={t('budgets.currency')} value={t(`currency.${budget.currency}`)} />
          </Card>

          <Section title={t('ui.editDetails')}>
            <Card style={styles.form}>
              <Field label={t('budgets.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" icon="cash" />
              <Field
                label={t('ui.endMonthOptional')}
                value={endMonth}
                onChangeText={setEndMonth}
                placeholder="YYYY-MM"
                icon="calendar-end"
              />
              <AppButton onPress={() => void save()} icon="check">{t('common.save')}</AppButton>
            </Card>
          </Section>

          <AppButton variant="dangerGhost" icon="trash-can-outline" onPress={() => setConfirmDelete(true)}>
            {t('budgets.delete')}
          </AppButton>
        </>
      ) : null}
      <ConfirmDialog
        visible={confirmDelete}
        icon="trash-can-outline"
        title={t('budgets.deleteConfirmation')}
        confirmLabel={t('budgets.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void remove()}
        onDismiss={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  form: { gap: spacing.xs },
});
