import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatMoney, parseMoney } from '@/domain/money';
import {
  archiveGoal,
  contributeToGoal,
  deleteGoal,
  getGoal,
  getGoalContributions,
  markAchieved,
  markActive,
  removeContribution,
  updateGoal,
  type Goal,
  type GoalContribution,
} from '@/services/goalService';
import {
  Amount,
  AppButton,
  AppText,
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  errorText,
  Field,
  IconAction,
  IconTile,
  ListGroup,
  ListRow,
  moneyText,
  Notice,
  ProgressBar,
  Screen,
  Section,
  spacing,
  todayIso,
  useDateFormat,
  useTokens,
} from '@/ui';

export default function GoalDetailScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const tokens = useTokens();
  const format = useDateFormat();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(todayIso);
  const [contributionNote, setContributionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [deleteContributionId, setDeleteContributionId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const goalId = Number(id);
        const goalData = await getGoal(database, goalId);
        if (!goalData) {
          setError(t('goals.notFound'));
          return;
        }
        const contribData = await getGoalContributions(database, goalId);
        if (active) {
          setGoal(goalData);
          setContributions(contribData);
          setName(goalData.name);
          setAmount(formatMoney(goalData.targetMinor, goalData.currency));
          setTargetDate(goalData.targetDate || '');
        }
      } catch (cause) {
        if (active) setError(errorText(cause, t('common.error')));
      }
    };
    void load();
    return () => { active = false; };
  }, [database, id, t]);

  const refreshGoal = async () => {
    if (!goal) return;
    try {
      const updated = await getGoal(database, goal.id);
      if (updated) setGoal(updated);
      setContributions(await getGoalContributions(database, goal.id));
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

  const saveGoal = async () => {
    if (!goal || !name.trim() || !amount) {
      setError(t('goals.nameAndAmountRequired'));
      return;
    }
    await run(async () => {
      await updateGoal(database, goal.id, {
        name: name.trim(),
        currency: goal.currency,
        targetMinor: parseMoney(amount, goal.currency),
        targetDate: targetDate || null,
        accountId: goal.accountId,
      });
      await refreshGoal();
    });
  };

  const removeGoal = () =>
    run(async () => {
      if (!goal) return;
      await deleteGoal(database, goal.id);
      setDeleteDialogId(null);
      router.back();
    });

  const toggleAchieved = () =>
    run(async () => {
      if (!goal) return;
      if (goal.achievedAt) await markActive(database, goal.id);
      else await markAchieved(database, goal.id);
      await refreshGoal();
    });

  const archiveIt = () =>
    run(async () => {
      if (!goal) return;
      await archiveGoal(database, goal.id);
      router.back();
    });

  const addContribution = async () => {
    if (!goal || !contributionAmount || !contributionDate) {
      setError(t('goals.contributionRequired'));
      return;
    }
    await run(async () => {
      await contributeToGoal(database, {
        goalId: goal.id,
        date: contributionDate,
        amountMinor: parseMoney(contributionAmount, goal.currency),
        note: contributionNote || null,
      });
      setContributionAmount('');
      setContributionDate(todayIso());
      setContributionNote('');
      await refreshGoal();
    });
  };

  const confirmDeleteContribution = () =>
    run(async () => {
      if (deleteContributionId === null) return;
      await removeContribution(database, deleteContributionId);
      setDeleteContributionId(null);
      await refreshGoal();
    });

  if (!goal) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('goals.edit') }} />
        {error ? <Notice tone="error" message={error} /> : <ActivityIndicator color={tokens.primary} />}
      </Screen>
    );
  }

  const progress = goal.targetMinor > 0n ? Number((goal.totalContributed * 100n) / goal.targetMinor) : 0;
  const remaining = goal.targetMinor - goal.totalContributed;
  const achieved = goal.achievedAt !== null;

  return (
    <Screen>
      <Stack.Screen options={{ title: goal.name }} />

      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <IconTile icon={achieved ? 'trophy-outline' : 'flag-outline'} tint={achieved ? 'positive' : 'primary'} size={48} />
          <View style={styles.flex}>
            <AppText variant="h2" numberOfLines={2}>{goal.name}</AppText>
            {goal.targetDate ? (
              <AppText variant="label" tone="muted">{t('ui.byDate', { date: format.date(goal.targetDate) })}</AppText>
            ) : null}
          </View>
          {achieved ? <Badge label={t('ui.achieved')} tint="positive" icon="check" /> : null}
        </View>
        <View style={styles.progressRow}>
          <AppText variant="display" numeric>{`${progress}%`}</AppText>
          <AppText variant="label" tone="secondary" style={styles.progressCaption}>{t('goals.complete')}</AppText>
        </View>
        <ProgressBar ratio={progress / 100} tone={achieved || progress >= 100 ? 'positive' : 'primary'} height={10} accessibilityLabel={t('goals.progress')} />
        <View style={styles.rowBetween}>
          <AppText variant="label" tone="secondary" numeric>
            {t('ui.savedOf', { saved: moneyText(goal.totalContributed, goal.currency), total: moneyText(goal.targetMinor, goal.currency) })}
          </AppText>
          {remaining > 0n ? (
            <AppText variant="label" tone="muted" numeric>{t('ui.amountLeft', { amount: moneyText(remaining, goal.currency) })}</AppText>
          ) : null}
        </View>
        <View style={styles.buttonRow}>
          <View style={styles.flex}>
            <AppButton
              variant={achieved ? 'secondary' : 'primary'}
              icon={achieved ? 'restore' : 'check-circle-outline'}
              onPress={() => void toggleAchieved()}
              disabled={loading}
            >
              {achieved ? t('goals.markActive') : t('goals.markAchieved')}
            </AppButton>
          </View>
          <IconAction icon="archive-arrow-down-outline" accessibilityLabel={t('goals.archive')} onPress={() => void archiveIt()} disabled={loading} />
        </View>
      </Card>

      {error ? <Notice tone="error" message={error} /> : null}

      <Section title={t('goals.addContribution')}>
        <Card style={styles.form}>
          <Field label={t('goals.contributionAmount')} value={contributionAmount} onChangeText={setContributionAmount} keyboardType="decimal-pad" icon="cash-plus" />
          <Field label={t('goals.contributionDate')} value={contributionDate} onChangeText={setContributionDate} placeholder="YYYY-MM-DD" icon="calendar-blank-outline" />
          <Field label={t('goals.contributionNote')} value={contributionNote} onChangeText={setContributionNote} placeholder={t('goals.contributionNotePlaceholder')} icon="note-text-outline" />
          <AppButton variant="tonal" icon="plus" onPress={() => void addContribution()} disabled={loading || !contributionAmount || !contributionDate}>
            {t('goals.addContribution')}
          </AppButton>
        </Card>
      </Section>

      <Section title={t('goals.contributionHistory')}>
        {contributions.length === 0 ? (
          <EmptyState compact icon="history" title={t('goals.noContributions')} />
        ) : (
          <ListGroup>
            {contributions.map((item) => (
              <ListRow
                key={item.id}
                title={format.date(item.date)}
                subtitle={item.note}
                leading={<IconTile icon="cash-plus" tint="positive" />}
                trailing={
                  <View style={styles.trailing}>
                    <Amount minor={item.amountMinor} currency={goal.currency} kind="income" />
                    <IconAction
                      icon="close"
                      size={32}
                      accessibilityLabel={t('goals.deleteContribution')}
                      onPress={() => setDeleteContributionId(item.id)}
                    />
                  </View>
                }
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title={t('goals.goalDetails')}>
        <Card style={styles.form}>
          <Field label={t('goals.name')} value={name} onChangeText={setName} icon="flag-outline" />
          <Field label={t('goals.targetAmount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" icon="cash" />
          <Field label={t('ui.targetDateOptional')} value={targetDate} onChangeText={setTargetDate} placeholder={t('goals.targetDatePlaceholder')} icon="calendar-blank-outline" />
          <AppButton onPress={() => void saveGoal()} disabled={loading} icon="check">{t('common.save')}</AppButton>
        </Card>
      </Section>

      <AppButton variant="dangerGhost" icon="trash-can-outline" onPress={() => setDeleteDialogId(goal.id)} disabled={loading}>
        {t('goals.deleteGoal')}
      </AppButton>

      <ConfirmDialog
        visible={deleteDialogId !== null}
        icon="trash-can-outline"
        title={t('goals.deleteConfirmation')}
        confirmLabel={t('goals.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void removeGoal()}
        onDismiss={() => setDeleteDialogId(null)}
      />
      <ConfirmDialog
        visible={deleteContributionId !== null}
        icon="trash-can-outline"
        title={t('goals.deleteContributionConfirmation')}
        confirmLabel={t('goals.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDeleteContribution()}
        onDismiss={() => setDeleteContributionId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { gap: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xs },
  progressCaption: { marginBottom: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  form: { gap: spacing.xs },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
