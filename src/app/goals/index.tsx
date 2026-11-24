import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { parseMoney, type Currency } from '@/domain/money';
import { createGoal, deleteGoal, listGoals, type Goal } from '@/services/goalService';
import { listAccounts, type Account } from '@/services/ledgerSetupService';
import {
  accountIcon,
  AppButton,
  AppText,
  Badge,
  Card,
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
  Screen,
  SegmentedControl,
  spacing,
  useDateFormat,
  useFocusData,
} from '@/ui';

function goalProgress(goal: Goal): number {
  return goal.targetMinor > 0n ? Number((goal.totalContributed * 100n) / goal.targetMinor) : 0;
}

export default function GoalsScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const format = useDateFormat();

  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogGoalId, setDeleteDialogGoalId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');

  const load = useCallback(async () => {
    const [goals, accounts] = await Promise.all([listGoals(database), listAccounts(database)]);
    setError(null);
    return { goals, accounts };
  }, [database]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, reload } = useFocusData(load, onError);
  const goals: Goal[] = data?.goals ?? [];
  const accounts: Account[] = data?.accounts ?? [];

  const addGoal = async () => {
    if (!name.trim() || !amount) {
      setError(t('goals.nameAndAmountRequired'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const targetMinor = parseMoney(amount, currency);
      await createGoal(database, {
        name: name.trim(),
        currency,
        targetMinor,
        targetDate: targetDate || null,
        accountId: accountId || null,
      });
      setName('');
      setAmount('');
      setTargetDate('');
      setAccountId(null);
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
    if (deleteDialogGoalId === null) return;
    setError(null);
    setLoading(true);
    try {
      await deleteGoal(database, deleteDialogGoalId);
      setDeleteDialogGoalId(null);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const displayedGoals = filter === 'active'
    ? goals.filter((g) => g.achievedAt === null && g.archivedAt === null)
    : goals.filter((g) => g.achievedAt !== null || g.archivedAt !== null);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('goals.manageTitle') }} />

      <Composer
        open={composerOpen}
        onToggle={setComposerOpen}
        openLabel={t('goals.createGoal')}
        closeLabel={t('common.cancel')}
        title={t('goals.createGoal')}
      >
        <Field label={t('goals.name')} value={name} onChangeText={setName} placeholder={t('goals.namePlaceholder')} icon="flag-outline" />
        <Field label={t('goals.targetAmount')} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" icon="cash" />
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
          label={t('ui.targetDateOptional')}
          value={targetDate}
          onChangeText={setTargetDate}
          placeholder={t('goals.targetDatePlaceholder')}
          icon="calendar-blank-outline"
        />
        {accounts.some((a) => !a.archivedAt) ? (
          <>
            <AppText variant="label" tone="secondary">{t('ui.linkedAccount')}</AppText>
            <ChoiceChips
              scroll
              allowDeselect
              value={accountId === null ? null : String(accountId)}
              onChange={(value) => setAccountId(value ? Number(value) : null)}
              accessibilityLabel={t('ui.linkedAccount')}
              options={accounts
                .filter((a) => !a.archivedAt)
                .map((a) => ({ value: String(a.id), label: a.name, icon: accountIcon(a.type) }))}
            />
          </>
        ) : null}
        <AppButton
          accessibilityHint={t('ui.createGoalHint')}
          onPress={() => void addGoal()}
          disabled={loading || !name.trim() || !amount}
          loading={loading}
        >
          {t('goals.createGoal')}
        </AppButton>
      </Composer>

      {error ? <Notice tone="error" message={error} /> : null}

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        accessibilityLabel={t('goals.manageTitle')}
        options={[
          { value: 'active', label: t('goals.active') },
          { value: 'completed', label: t('goals.completed') },
        ]}
      />

      {displayedGoals.length === 0 ? (
        <EmptyState
          icon="flag-checkered"
          title={filter === 'active' ? t('goals.noActiveGoals') : t('goals.noCompletedGoals')}
          message={filter === 'active' ? t('ui.noGoalsMessage') : undefined}
        />
      ) : (
        displayedGoals.map((item, index) => {
          const progress = goalProgress(item);
          const isAchieved = item.achievedAt !== null;
          return (
            <FadeIn key={item.id} index={index}>
              <Card
                onPress={() => router.push(`/goals/${item.id}` as Href)}
                accessibilityLabel={`${item.name}, ${progress}% ${t('goals.complete')}`}
                accessibilityHint={t('goals.goalDetails')}
              >
                <View style={styles.header}>
                  <IconTile icon={isAchieved ? 'trophy-outline' : 'flag-outline'} tint={isAchieved ? 'positive' : 'primary'} />
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{item.name}</AppText>
                    <AppText variant="label" tone="muted" numeric>
                      {t('ui.savedOf', {
                        saved: moneyText(item.totalContributed, item.currency),
                        total: moneyText(item.targetMinor, item.currency),
                      })}
                    </AppText>
                  </View>
                  <IconAction
                    icon="trash-can-outline"
                    accessibilityLabel={`${t('goals.deleteGoal')}: ${item.name}`}
                    onPress={() => setDeleteDialogGoalId(item.id)}
                  />
                </View>
                <ProgressBar ratio={progress / 100} tone={isAchieved || progress >= 100 ? 'positive' : 'primary'} accessibilityLabel={item.name} />
                <View style={styles.footer}>
                  <AppText variant="label" tone="secondary" numeric>{`${progress}% ${t('goals.complete')}`}</AppText>
                  {isAchieved ? (
                    <Badge label={t('ui.achieved')} tint="positive" icon="check" />
                  ) : item.archivedAt ? (
                    <Badge label={t('ui.archived')} icon="archive-outline" />
                  ) : item.targetDate ? (
                    <Badge label={t('ui.byDate', { date: format.date(item.targetDate) })} icon="calendar-blank-outline" />
                  ) : null}
                </View>
              </Card>
            </FadeIn>
          );
        })
      )}

      <ConfirmDialog
        visible={deleteDialogGoalId !== null}
        icon="trash-can-outline"
        title={t('goals.deleteConfirmation')}
        confirmLabel={t('goals.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDelete()}
        onDismiss={() => setDeleteDialogGoalId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
