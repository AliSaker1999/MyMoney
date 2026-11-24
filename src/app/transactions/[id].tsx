import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatMoney, formatRate, parseMoney, parseRate } from '@/domain/money';
import { deleteTransaction, getTransaction, updateTransaction, type LedgerTransaction } from '@/services/ledgerService';
import {
  Amount,
  AppButton,
  AppText,
  Badge,
  Card,
  categoryIcon,
  categoryLabel,
  ConfirmDialog,
  Divider,
  errorText,
  Field,
  IconTile,
  KeyValue,
  kindIcon,
  kindTint,
  Notice,
  Screen,
  Section,
  spacing,
  useDateFormat,
} from '@/ui';

export default function EditTransactionScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const format = useDateFormat();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [transaction, setTransaction] = useState<LedgerTransaction | null>(null);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const transactionId = Number(id);
    void getTransaction(database, transactionId).then((next) => {
      if (!next) {
        setError(t('transactions.unavailable'));
        return;
      }
      setTransaction(next);
      setDate(next.date);
      const entry = next.entries[0];
      if (entry) setAmount(formatMoney(entry.amountMinor, entry.currency));
      setRate(formatRate(next.rateE4));
      setPayee(next.payee ?? '');
      setNote(next.note ?? '');
    }).catch((cause: unknown) => setError(errorText(cause, t('common.error'))));
  }, [database, id, t]);

  const save = async () => {
    if (!transaction) return;
    const entry = transaction.entries[0];
    if (!entry) return;
    if (transaction.kind === 'transfer') {
      setError(t('transactions.transferEditUnavailable'));
      return;
    }
    setSaving(true);
    try {
      await updateTransaction(database, transaction.id, {
        kind: transaction.kind,
        date,
        accountId: entry.accountId,
        categoryId: entry.categoryId ?? undefined,
        amountMinor: parseMoney(amount, entry.currency),
        rateE4: parseRate(rate),
        payee,
        note,
      });
      router.back();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!transaction) return;
    setConfirmDelete(false);
    try {
      await deleteTransaction(database, transaction.id);
      router.back();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    }
  };

  const entry = transaction?.entries[0];
  const isTransfer = transaction?.kind === 'transfer';
  const category = entry ? categoryLabel(t, entry.categoryName, entry.categoryBuiltinKey) : '';

  return (
    <Screen>
      <Stack.Screen options={{ title: t('transactions.edit') }} />
      {error ? <Notice tone="error" message={error} /> : null}
      {transaction && entry ? (
        <>
          <Card style={styles.summary}>
            <IconTile
              icon={entry.categoryBuiltinKey ? categoryIcon(entry.categoryBuiltinKey) : kindIcon(transaction.kind)}
              tint={kindTint(transaction.kind)}
              size={52}
            />
            <Badge label={t(`transactions.${transaction.kind}`)} tint={kindTint(transaction.kind)} />
            <Amount minor={entry.amountMinor} currency={entry.currency} kind={transaction.kind} variant="h1" />
            <AppText variant="label" tone="secondary" align="center">
              {[transaction.payee, category].filter(Boolean).join(' · ') || entry.accountName}
            </AppText>
            <Divider style={styles.summaryDivider} />
            <View style={styles.facts}>
              <KeyValue label={t('ui.account')} value={entry.accountName} />
              <KeyValue label={t('ui.date')} value={format.date(transaction.date)} />
              <KeyValue label={t('transactions.rate')} value={formatRate(transaction.rateE4)} numeric />
              {transaction.rateSourceLabel ? (
                <KeyValue label={t('rates.source')} value={transaction.rateSourceLabel} />
              ) : null}
            </View>
          </Card>

          {isTransfer ? (
            <Notice tone="info" message={t('transactions.transferEditUnavailable')} />
          ) : (
            <Section title={t('ui.editDetails')}>
              <Card style={styles.form}>
                <Field label={t('transactions.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" icon="cash" />
                <Field label={t('transactions.date')} value={date} onChangeText={setDate} icon="calendar-blank-outline" />
                <Field label={t('transactions.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" icon="swap-horizontal" />
                <Field label={t('transactions.payee')} value={payee} onChangeText={setPayee} icon="storefront-outline" />
                <Field label={t('transactions.note')} value={note} onChangeText={setNote} icon="note-text-outline" multiline />
                <AppButton onPress={() => void save()} loading={saving} disabled={saving} icon="check">
                  {t('common.save')}
                </AppButton>
              </Card>
            </Section>
          )}

          <AppButton variant="dangerGhost" icon="trash-can-outline" onPress={() => setConfirmDelete(true)}>
            {t('transactions.delete')}
          </AppButton>
        </>
      ) : null}

      <ConfirmDialog
        visible={confirmDelete}
        icon="trash-can-outline"
        title={t('transactions.delete')}
        message={t('ui.deleteTransactionMessage')}
        confirmLabel={t('ui.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void remove()}
        onDismiss={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  summaryDivider: { alignSelf: 'stretch', marginVertical: spacing.sm },
  facts: { alignSelf: 'stretch', gap: spacing.xs },
  form: { gap: spacing.xs },
});
