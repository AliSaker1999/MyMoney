import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import type { Currency } from '@/domain/money';
import { createDebt, deleteDebt, listDebts, type Debt, type DebtDirection } from '@/services/debtService';
import {
  Amount,
  AppButton,
  AppText,
  Avatar,
  Badge,
  Card,
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
  Screen,
  SegmentedControl,
  spacing,
  todayIso,
  useDateFormat,
  useFocusData,
  type Tint,
} from '@/ui';

export default function DebtsScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const format = useDateFormat();

  const [composerOpen, setComposerOpen] = useState(false);
  const [counterparty, setCounterparty] = useState('');
  const [direction, setDirection] = useState<DebtDirection>('i_owe');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'active' | 'settled'>('active');

  const load = useCallback(async () => {
    const debts = await listDebts(database);
    setError(null);
    return debts;
  }, [database]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, reload } = useFocusData(load, onError);
  const debts: Debt[] = data ?? [];

  const addDebt = async () => {
    if (!counterparty.trim() || !startDate) {
      setError(t('debts.counterpartyAndDateRequired'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await createDebt(database, {
        counterparty: counterparty.trim(),
        direction,
        currency,
        startDate,
        dueDate: dueDate || null,
      });
      setCounterparty('');
      setStartDate('');
      setDueDate('');
      setDirection('i_owe');
      setCurrency('USD');
      setComposerOpen(false);
      setFilter('active');
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteDialogId === null) return;
    setError(null);
    setLoading(true);
    try {
      await deleteDebt(database, deleteDialogId);
      setDeleteDialogId(null);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const activeDebts = debts.filter((d) => d.settledAt === null);
  const displayedDebts = filter === 'active' ? activeDebts : debts.filter((d) => d.settledAt !== null);
  const today = todayIso();

  const totalsFor = (dir: DebtDirection) =>
    (['USD', 'LBP'] as const)
      .map((code) => ({
        code,
        amount: activeDebts
          .filter((d) => d.direction === dir && d.currency === code)
          .reduce((sum, d) => sum + d.outstandingMinor, 0n),
      }))
      .filter((item) => item.amount !== 0n);

  const summary = (dir: DebtDirection, label: string, icon: string, tint: Tint) => {
    const totals = totalsFor(dir);
    return (
      <Card style={styles.summary}>
        <View style={styles.summaryHeader}>
          <IconTile icon={icon} tint={tint} size={28} />
          <AppText variant="label" tone="secondary">{label}</AppText>
        </View>
        {totals.length === 0 ? (
          <AppText variant="h2" tone="muted" numeric>{moneyText(0n, 'USD')}</AppText>
        ) : (
          totals.map((item, index) => (
            <AppText key={item.code} variant={index === 0 ? 'h2' : 'bodyStrong'} tone={index === 0 ? 'default' : 'secondary'} numeric numberOfLines={1} adjustsFontSizeToFit>
              {moneyText(item.amount, item.code)}
            </AppText>
          ))
        )}
      </Card>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('debts.manageTitle') }} />

      <FadeIn index={0}>
        <View style={styles.summaries}>
          {summary('i_owe', t('ui.youOwe'), 'arrow-top-right', 'warning')}
          {summary('owed_to_me', t('ui.owedToYou'), 'arrow-bottom-left', 'positive')}
        </View>
      </FadeIn>

      <Composer
        open={composerOpen}
        onToggle={setComposerOpen}
        openLabel={t('debts.createDebt')}
        closeLabel={t('common.cancel')}
        title={t('debts.createDebt')}
      >
        <Field
          label={t('debts.counterparty')}
          value={counterparty}
          onChangeText={setCounterparty}
          placeholder={t('debts.counterpartyPlaceholder')}
          icon="account-outline"
        />
        <SegmentedControl
          value={direction}
          onChange={setDirection}
          accessibilityLabel={t('debts.direction')}
          options={[
            { value: 'i_owe', label: t('debts.iOwe') },
            { value: 'owed_to_me', label: t('debts.owedToMe') },
          ]}
        />
        <SegmentedControl
          value={currency}
          onChange={setCurrency}
          accessibilityLabel={t('budgets.currency')}
          options={[
            { value: 'USD', label: t('currency.USD') },
            { value: 'LBP', label: t('currency.LBP') },
          ]}
        />
        <View style={styles.twoUp}>
          <View style={styles.flex}>
            <Field
              label={t('debts.startDate')}
              accessibilityHint={t('ui.dateHint')}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.flex}>
            <Field
              label={t('ui.dueDateOptional')}
              accessibilityHint={t('ui.dateHint')}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>
        <AppButton
          accessibilityHint={t('ui.createDebtHint')}
          onPress={() => void addDebt()}
          disabled={loading || !counterparty.trim() || !startDate}
          loading={loading}
        >
          {t('debts.createDebt')}
        </AppButton>
      </Composer>

      {error ? <Notice tone="error" message={error} /> : null}

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        accessibilityLabel={t('debts.manageTitle')}
        options={[
          { value: 'active', label: t('debts.active') },
          { value: 'settled', label: t('debts.settled') },
        ]}
      />

      {displayedDebts.length === 0 ? (
        <EmptyState
          icon="handshake-outline"
          title={filter === 'active' ? t('debts.noActiveDebts') : t('debts.noSettledDebts')}
          message={filter === 'active' ? t('ui.noDebtsMessage') : undefined}
        />
      ) : (
        displayedDebts.map((item, index) => {
          const owedToMe = item.direction === 'owed_to_me';
          const overdue = item.settledAt === null && item.dueDate !== null && item.dueDate < today;
          return (
            <FadeIn key={item.id} index={index}>
              <Card
                onPress={() => router.push(`/debts/${item.id}` as Href)}
                accessibilityLabel={`${item.counterparty}, ${t(`debts.direction.${item.direction}`)}`}
                accessibilityHint={t('debts.debtDetails')}
              >
                <View style={styles.header}>
                  <Avatar label={item.counterparty} tint={owedToMe ? 'positive' : 'warning'} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{item.counterparty}</AppText>
                    <AppText variant="label" tone="muted">{t(`debts.direction.${item.direction}`)}</AppText>
                  </View>
                  <View style={styles.amount}>
                    <Amount
                      minor={item.outstandingMinor}
                      currency={item.currency}
                      tone={item.settledAt ? 'muted' : owedToMe ? 'positive' : 'default'}
                    />
                    <AppText variant="caption" tone="muted">{t('debts.outstanding')}</AppText>
                  </View>
                  <IconAction
                    icon="trash-can-outline"
                    size={36}
                    accessibilityLabel={`${t('debts.delete')}: ${item.counterparty}`}
                    onPress={() => setDeleteDialogId(item.id)}
                  />
                </View>
                <View style={styles.badges}>
                  {item.settledAt ? (
                    <Badge label={t('debts.settled')} tint="positive" icon="check" />
                  ) : overdue ? (
                    <Badge label={t('ui.overdue')} tint="negative" icon="alert-circle-outline" />
                  ) : null}
                  {item.dueDate ? (
                    <Badge label={t('ui.dueOn', { date: format.date(item.dueDate) })} icon="calendar-blank-outline" />
                  ) : (
                    <Badge label={t('ui.sinceDate', { date: format.date(item.startDate) })} icon="calendar-blank-outline" />
                  )}
                </View>
              </Card>
            </FadeIn>
          );
        })
      )}

      <ConfirmDialog
        visible={deleteDialogId !== null}
        icon="trash-can-outline"
        title={t('debts.deleteConfirmation')}
        confirmLabel={t('debts.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => setDeleteDialogId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  summaries: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summary: { flex: 1, minWidth: 150, gap: spacing.xs },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  twoUp: { flexDirection: 'row', gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amount: { alignItems: 'flex-end' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingStart: 52 },
});
