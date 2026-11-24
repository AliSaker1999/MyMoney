import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatRate, parseMoney, parseRate } from '@/domain/money';
import {
  listAccounts,
  listCategories,
  type Account,
  type Category,
} from '@/services/ledgerSetupService';
import { createTransaction, createTransfer, type FlowKind } from '@/services/ledgerService';
import { getPreferredRateSourceId, lookupRate, type RateLookup } from '@/services/ratesService';
import {
  accountIcon,
  AmountField,
  AppButton,
  AppText,
  Card,
  categoryIcon,
  categoryLabel,
  ChoiceChips,
  errorText,
  Field,
  Notice,
  Screen,
  Section,
  SegmentedControl,
  spacing,
  StickyFooter,
  todayIso,
} from '@/ui';

type Kind = FlowKind | 'transfer';

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default function NewTransactionScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<Kind>(
    params.kind === 'income' ? 'income'
      : params.kind === 'refund' ? 'refund'
        : params.kind === 'transfer' ? 'transfer'
          : 'expense',
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<number | null>(null);
  const [feeAmount, setFeeAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [suggestedRate, setSuggestedRate] = useState<RateLookup | null>(null);
  const lastSuggestedText = useRef('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([listAccounts(database), listCategories(database)])
      .then(([nextAccounts, nextCategories]) => {
        const active = nextAccounts.filter((account) => account.archivedAt === null);
        setAccounts(active);
        setCategories(nextCategories.filter((category) => category.archivedAt === null));
        setAccountId(active[0]?.id ?? null);
        setDestinationAccountId(active[1]?.id ?? null);
      })
      .catch((cause: unknown) => setError(errorText(cause, t('common.error'))));
  }, [database, t]);

  // Suggest the preferred source's quote for the chosen date; the field stays fully editable.
  useEffect(() => {
    if (!isIsoDate(date)) return;
    let active = true;
    void getPreferredRateSourceId(database)
      .then((sourceId) => (sourceId === null ? null : lookupRate(database, sourceId, date)))
      .then((lookup) => {
        if (!active) return;
        setSuggestedRate(lookup);
        if (!lookup) return;
        const text = formatRate(lookup.rateE4);
        // Replace the field only while it is empty or still holds the previous suggestion.
        setRate((current) => (current === '' || current === lastSuggestedText.current ? text : current));
        lastSuggestedText.current = text;
      })
      .catch(() => {
        if (active) setSuggestedRate(null);
      });
    return () => {
      active = false;
    };
  }, [database, date]);

  const account = accounts.find((item) => item.id === accountId);
  const categoryKind = kind === 'income' ? 'income' : 'expense';
  const matchingCategories = categories.filter((item) => item.kind === categoryKind);
  const usingSuggestedRate = suggestedRate !== null && rate === formatRate(suggestedRate.rateE4);

  const changeKind = (next: Kind) => {
    const nextCategoryKind = next === 'income' ? 'income' : 'expense';
    if (nextCategoryKind !== categoryKind) setCategoryId(null);
    setError(null);
    setKind(next);
  };

  const rateProvenance = () =>
    usingSuggestedRate && suggestedRate
      ? {
          rateOrigin: 'source' as const,
          rateSourceId: suggestedRate.sourceId,
          rateSourceLabel: suggestedRate.sourceLabel,
          rateId: suggestedRate.id,
          rateDate: suggestedRate.effectiveDate,
        }
      : {};

  const save = async () => {
    if (!account) {
      setError(t('ui.chooseAccount'));
      return;
    }
    setError(null);
    if (kind !== 'transfer' && categoryId === null) {
      setError(t('ui.chooseCategory'));
      return;
    }
    setLoading(true);
    try {
      if (kind === 'transfer') {
        if (destinationAccountId === null) throw new Error(t('ui.chooseDestination'));
        await createTransfer(database, {
          date,
          source: { accountId: account.id, amountMinor: parseMoney(amount, account.currency) },
          destination: { accountId: destinationAccountId, amountMinor: 0n },
          rateE4: parseRate(rate),
          feeAmountMinor: feeAmount ? parseMoney(feeAmount, account.currency) : null,
          feeAccountId: account.id,
          feeCategoryId: categoryId,
          payee,
          note,
        });
        router.back();
        return;
      }
      if (categoryId === null) return;
      await createTransaction(database, {
        kind,
        date,
        accountId: account.id,
        categoryId,
        amountMinor: parseMoney(amount, account.currency),
        rateE4: parseRate(rate),
        ...rateProvenance(),
        payee,
        note,
      });
      router.back();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const accountChoices = accounts.map((item) => ({
    value: String(item.id),
    label: `${item.name} · ${item.currency}`,
    icon: accountIcon(item.type),
  }));

  return (
    <Screen
      footer={
        <StickyFooter>
          <AppButton onPress={() => void save()} loading={loading} disabled={loading} icon="check">
            {t('common.save')}
          </AppButton>
        </StickyFooter>
      }
    >
      <Stack.Screen options={{ title: t('transactions.new') }} />

      <SegmentedControl
        value={kind}
        onChange={changeKind}
        accessibilityLabel={t('ui.transactionType')}
        options={[
          { value: 'expense', label: t('transactions.expense') },
          { value: 'income', label: t('transactions.income') },
          { value: 'refund', label: t('transactions.refund') },
          { value: 'transfer', label: t('transactions.transfer') },
        ]}
      />

      <AmountField
        label={t('transactions.amount')}
        value={amount}
        onChangeText={setAmount}
        currency={account?.currency}
        tone={kind === 'income' || kind === 'refund' ? 'positive' : 'default'}
      />

      {accounts.length === 0 ? (
        <Notice tone="warning" message={t('ui.noAccountsForTransaction')} />
      ) : (
        <Section title={kind === 'transfer' ? t('ui.fromAccount') : t('ui.account')}>
          <ChoiceChips
            scroll
            value={accountId === null ? null : String(accountId)}
            onChange={(value) => value && setAccountId(Number(value))}
            options={accountChoices}
            accessibilityLabel={kind === 'transfer' ? t('ui.fromAccount') : t('ui.account')}
          />
        </Section>
      )}

      {kind === 'transfer' ? (
        <Section title={t('ui.toAccount')}>
          <ChoiceChips
            scroll
            value={destinationAccountId === null ? null : String(destinationAccountId)}
            onChange={(value) => value && setDestinationAccountId(Number(value))}
            options={accountChoices.map((choice) => ({ ...choice, disabled: choice.value === String(accountId) }))}
            accessibilityLabel={t('ui.toAccount')}
          />
        </Section>
      ) : null}

      <Section title={kind === 'transfer' ? t('ui.feeCategory') : t('budgets.category')}>
        <ChoiceChips
          value={categoryId === null ? null : String(categoryId)}
          onChange={(value) => setCategoryId(value === null ? null : Number(value))}
          allowDeselect={kind === 'transfer'}
          accessibilityLabel={t('budgets.category')}
          options={matchingCategories.map((item) => ({
            value: String(item.id),
            label: categoryLabel(t, item.name, item.builtinKey),
            icon: categoryIcon(item.builtinKey, item.kind),
          }))}
        />
      </Section>

      <Section title={t('ui.details')}>
        <Card style={styles.details}>
          <Field label={t('transactions.date')} value={date} onChangeText={setDate} icon="calendar-blank-outline" autoCorrect={false} />
          <Field
            label={t('transactions.rate')}
            value={rate}
            onChangeText={setRate}
            keyboardType="decimal-pad"
            icon="swap-horizontal"
            helper={
              usingSuggestedRate && suggestedRate
                ? t('ui.rateSuggested', {
                    source: suggestedRate.sourceCode ? t(`rateSource.${suggestedRate.sourceCode}`) : suggestedRate.sourceLabel,
                    date: suggestedRate.effectiveDate,
                  })
                : suggestedRate === null
                  ? t('ui.rateManual')
                  : undefined
            }
          />
          {kind === 'transfer' ? (
            <Field
              label={t('transactions.feeAmount')}
              value={feeAmount}
              onChangeText={setFeeAmount}
              keyboardType="decimal-pad"
              icon="cash-minus"
            />
          ) : null}
          <Field label={t('transactions.payee')} value={payee} onChangeText={setPayee} icon="storefront-outline" />
          <Field label={t('transactions.note')} value={note} onChangeText={setNote} icon="note-text-outline" multiline />
        </Card>
      </Section>

      {suggestedRate?.isStale && usingSuggestedRate ? (
        <Notice tone="warning" message={t('rates.staleRate', { days: suggestedRate.ageDays })} />
      ) : null}
      {error ? <Notice tone="error" message={error} /> : null}
      <View style={styles.spacer}>
        <AppText variant="caption" tone="muted" align="center">
          {t('ui.offlineEncrypted')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.xs },
  spacer: { paddingBottom: spacing.lg },
});
