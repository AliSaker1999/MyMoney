import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { parseMoney } from '@/domain/money';
import {
  deleteDebt,
  getDebt,
  getDebtMovements,
  recordDebtMovement,
  removeDebtMovement,
  reopenDebt,
  settleDebt,
  updateDebt,
  type Debt,
  type DebtMovement,
} from '@/services/debtService';
import {
  Amount,
  AppButton,
  AppText,
  Avatar,
  Badge,
  Card,
  ConfirmDialog,
  Divider,
  EmptyState,
  errorText,
  Field,
  IconAction,
  IconTile,
  KeyValue,
  ListGroup,
  ListRow,
  moneyText,
  Notice,
  Screen,
  Section,
  spacing,
  todayIso,
  useDateFormat,
  useTokens,
} from '@/ui';

export default function DebtDetailScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const tokens = useTokens();
  const format = useDateFormat();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [debt, setDebt] = useState<Debt | null>(null);
  const [movements, setMovements] = useState<DebtMovement[]>([]);
  const [counterparty, setCounterparty] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDate, setMovementDate] = useState(todayIso);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [deleteMovementId, setDeleteMovementId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const debtId = Number(id);
        const debtData = await getDebt(database, debtId);
        if (!debtData) {
          setError(t('debts.notFound'));
          return;
        }
        const movementsData = await getDebtMovements(database, debtId);
        if (active) {
          setDebt(debtData);
          setMovements(movementsData);
          setCounterparty(debtData.counterparty);
          setDueDate(debtData.dueDate || '');
        }
      } catch (cause) {
        if (active) setError(errorText(cause, t('common.error')));
      }
    };
    void load();
    return () => { active = false; };
  }, [database, id, t]);

  const refreshDebt = async () => {
    if (!debt) return;
    try {
      const updated = await getDebt(database, debt.id);
      if (updated) setDebt(updated);
      setMovements(await getDebtMovements(database, debt.id));
      setError(null);
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    }
  };

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const saveDebt = async () => {
    if (!debt || !counterparty.trim()) {
      setError(t('debts.counterpartyRequired'));
      return;
    }
    await run(async () => {
      await updateDebt(database, debt.id, {
        counterparty: counterparty.trim(),
        direction: debt.direction,
        currency: debt.currency,
        startDate: debt.startDate,
        dueDate: dueDate || null,
      });
      await refreshDebt();
    });
  };

  const removeDebt = () =>
    run(async () => {
      if (!debt) return;
      await deleteDebt(database, debt.id);
      setDeleteDialogId(null);
      router.back();
    });

  const toggleSettled = () =>
    run(async () => {
      if (!debt) return;
      if (debt.settledAt) await reopenDebt(database, debt.id);
      else await settleDebt(database, debt.id);
      await refreshDebt();
    });

  const addMovement = async () => {
    if (!debt || !movementAmount || !movementDate) {
      setError(t('debts.movementRequired'));
      return;
    }
    await run(async () => {
      await recordDebtMovement(database, {
        debtId: debt.id,
        date: movementDate,
        amountMinor: parseMoney(movementAmount, debt.currency),
      });
      setMovementAmount('');
      setMovementDate(todayIso());
      await refreshDebt();
    });
  };

  const confirmDeleteMovement = () =>
    run(async () => {
      if (deleteMovementId === null) return;
      await removeDebtMovement(database, deleteMovementId);
      setDeleteMovementId(null);
      await refreshDebt();
    });

  if (!debt) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('debts.edit') }} />
        {error ? <Notice tone="error" message={error} /> : <ActivityIndicator color={tokens.primary} />}
      </Screen>
    );
  }

  const owedToMe = debt.direction === 'owed_to_me';
  const settled = debt.settledAt !== null;
  const overdue = !settled && debt.dueDate !== null && debt.dueDate < todayIso();

  return (
    <Screen>
      <Stack.Screen options={{ title: debt.counterparty }} />

      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <Avatar label={debt.counterparty} tint={owedToMe ? 'positive' : 'warning'} size={48} />
          <View style={styles.flex}>
            <AppText variant="h2" numberOfLines={1}>{debt.counterparty}</AppText>
            <AppText variant="label" tone="muted">{t(`debts.direction.${debt.direction}`)}</AppText>
          </View>
          {settled ? (
            <Badge label={t('debts.settled')} tint="positive" icon="check" />
          ) : overdue ? (
            <Badge label={t('ui.overdue')} tint="negative" icon="alert-circle-outline" />
          ) : null}
        </View>
        <AppText variant="overline" tone="muted" uppercase>{t('debts.outstanding')}</AppText>
        <AppText variant="display" numeric tone={settled ? 'muted' : owedToMe ? 'positive' : 'default'} numberOfLines={1} adjustsFontSizeToFit>
          {moneyText(debt.outstandingMinor, debt.currency)}
        </AppText>
        <Divider style={styles.divider} />
        <KeyValue label={t('debts.startDate')} value={format.date(debt.startDate)} />
        {debt.dueDate ? <KeyValue label={t('ui.dueDate')} value={format.date(debt.dueDate)} /> : null}
        <AppButton
          variant={settled ? 'secondary' : 'primary'}
          icon={settled ? 'restore' : 'check-circle-outline'}
          onPress={() => void toggleSettled()}
          disabled={loading}
          style={styles.heroButton}
        >
          {settled ? t('debts.reopen') : t('debts.settle')}
        </AppButton>
      </Card>

      {error ? <Notice tone="error" message={error} /> : null}

      <Section title={t('debts.recordMovement')} caption={t('ui.movementHint')}>
        <Card style={styles.form}>
          <View style={styles.twoUp}>
            <View style={styles.flex}>
              <Field label={t('debts.movementAmount')} value={movementAmount} onChangeText={setMovementAmount} keyboardType="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <Field label={t('debts.movementDate')} value={movementDate} onChangeText={setMovementDate} placeholder="YYYY-MM-DD" />
            </View>
          </View>
          <AppButton variant="tonal" icon="plus" onPress={() => void addMovement()} disabled={loading || !movementAmount || !movementDate}>
            {t('debts.recordMovement')}
          </AppButton>
        </Card>
      </Section>

      <Section title={t('debts.movementHistory')}>
        {movements.length === 0 ? (
          <EmptyState compact icon="history" title={t('debts.noMovements')} />
        ) : (
          <ListGroup>
            {movements.map((item) => (
              <ListRow
                key={item.id}
                title={format.date(item.date)}
                leading={<IconTile icon="swap-vertical" tint="neutral" />}
                trailing={
                  <View style={styles.trailing}>
                    <Amount minor={item.amountMinor} currency={debt.currency} kind="signed" />
                    <IconAction icon="close" size={32} accessibilityLabel={t('debts.deleteMovement')} onPress={() => setDeleteMovementId(item.id)} />
                  </View>
                }
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title={t('debts.debtDetails')}>
        <Card style={styles.form}>
          <Field label={t('debts.counterparty')} value={counterparty} onChangeText={setCounterparty} icon="account-outline" />
          <Field label={t('ui.dueDateOptional')} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" icon="calendar-blank-outline" />
          <AppButton onPress={() => void saveDebt()} disabled={loading} icon="check">{t('common.save')}</AppButton>
        </Card>
      </Section>

      <AppButton variant="dangerGhost" icon="trash-can-outline" onPress={() => setDeleteDialogId(debt.id)} disabled={loading}>
        {t('ui.deleteDebt')}
      </AppButton>

      <ConfirmDialog
        visible={deleteDialogId !== null}
        icon="trash-can-outline"
        title={t('debts.deleteConfirmation')}
        confirmLabel={t('debts.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void removeDebt()}
        onDismiss={() => setDeleteDialogId(null)}
      />
      <ConfirmDialog
        visible={deleteMovementId !== null}
        icon="trash-can-outline"
        title={t('debts.deleteMovementConfirmation')}
        confirmLabel={t('debts.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDeleteMovement()}
        onDismiss={() => setDeleteMovementId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { gap: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  divider: { marginVertical: spacing.xs },
  heroButton: { marginTop: spacing.sm },
  form: { gap: spacing.xs },
  twoUp: { flexDirection: 'row', gap: spacing.sm },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
