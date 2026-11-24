import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch } from 'react-native-paper';
import { router, Stack, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { formatMoney, formatRate, parseMoney, parseRate } from '@/domain/money';
import {
  archiveAccount,
  createAccount,
  getOpeningBalance,
  listAccounts,
  setOpeningBalance,
  updateOpeningBalance,
  type Account,
} from '@/services/ledgerSetupService';
import type { AccountCurrency, AccountType } from '@/services/onboardingService';
import {
  accountIcon,
  Amount,
  AppButton,
  AppText,
  Badge,
  Card,
  ChoiceChips,
  Composer,
  ConfirmDialog,
  Divider,
  EmptyState,
  errorText,
  FadeIn,
  Field,
  IconTile,
  ListRow,
  moneyText,
  Notice,
  Screen,
  Section,
  SegmentedControl,
  spacing,
  StatTile,
  todayIso,
  useTokens,
} from '@/ui';

const ACCOUNT_TYPES: readonly AccountType[] = ['cash', 'bank', 'card', 'wallet', 'savings', 'other'];

export default function AccountsScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [currency, setCurrency] = useState<AccountCurrency>('USD');
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [openingAccountId, setOpeningAccountId] = useState<number | null>(null);
  const [openingDate, setOpeningDate] = useState(todayIso);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingRate, setOpeningRate] = useState('');
  const [openingEditing, setOpeningEditing] = useState(false);
  const [archiving, setArchiving] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setAccounts(await listAccounts(database));
  }, [database]);

  useEffect(() => {
    let active = true;
    void listAccounts(database)
      .then((nextAccounts) => {
        if (active) setAccounts(nextAccounts);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, t('common.error')));
      });
    return () => { active = false; };
  }, [database, t]);

  const addAccount = async () => {
    setError(null);
    setLoading(true);
    try {
      await createAccount(database, { name, type, currency, includeInNetWorth });
      setName('');
      setComposerOpen(false);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const archive = async (accountId: number) => {
    setArchiving(null);
    setError(null);
    setLoading(true);
    try {
      await archiveAccount(database, accountId);
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const saveOpening = async () => {
    if (openingAccountId === null) return;
    setError(null);
    setLoading(true);
    try {
      const account = accounts.find((item) => item.id === openingAccountId);
      if (!account) throw new Error(t('common.error'));
      const input = {
        accountId: openingAccountId,
        date: openingDate,
        amountMinor: parseMoney(openingAmount, account.currency),
        rateE4: parseRate(openingRate),
      };
      if (openingEditing) {
        await updateOpeningBalance(database, input);
      } else {
        await setOpeningBalance(database, input);
      }
      setOpeningAccountId(null);
      setOpeningEditing(false);
      setOpeningAmount('');
      setOpeningRate('');
      await reload();
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    } finally {
      setLoading(false);
    }
  };

  const beginOpening = async (account: Account) => {
    setError(null);
    try {
      const existing = await getOpeningBalance(database, account.id);
      if (existing) {
        setOpeningAccountId(account.id);
        setOpeningEditing(true);
        setOpeningDate(existing.date);
        setOpeningAmount(formatMoney(existing.amountMinor, account.currency));
        setOpeningRate(formatRate(existing.rateE4));
        return;
      }
      setOpeningAccountId(account.id);
      setOpeningEditing(false);
      setOpeningDate(todayIso());
      setOpeningAmount('');
      setOpeningRate('');
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    }
  };

  const active = accounts.filter((account) => account.archivedAt === null);
  const archived = accounts.filter((account) => account.archivedAt !== null);
  const total = (code: AccountCurrency) =>
    active
      .filter((account) => account.currency === code && account.includeInNetWorth)
      .reduce((sum, account) => sum + account.balanceMinor, 0n);
  const openingAccount = accounts.find((account) => account.id === openingAccountId);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('accounts.manageTitle') }} />

      <FadeIn index={0}>
        <View style={styles.stats}>
          <StatTile label={t('currency.USD')} value={moneyText(total('USD'), 'USD')} icon="currency-usd" tint="primary" />
          <StatTile label={t('currency.LBP')} value={moneyText(total('LBP'), 'LBP')} icon="cash-multiple" tint="info" />
        </View>
      </FadeIn>

      <Composer
        open={composerOpen}
        onToggle={setComposerOpen}
        openLabel={t('accounts.add')}
        closeLabel={t('common.cancel')}
        title={t('accounts.create')}
      >
        <Field label={t('accounts.name')} value={name} onChangeText={setName} icon="form-textbox" />
        <AppText variant="label" tone="secondary">{t('accounts.type')}</AppText>
        <ChoiceChips
          value={type}
          onChange={(value) => value && setType(value)}
          accessibilityLabel={t('accounts.type')}
          options={ACCOUNT_TYPES.map((item) => ({ value: item, label: t(`account.type.${item}`), icon: accountIcon(item) }))}
        />
        <SegmentedControl
          value={currency}
          onChange={setCurrency}
          accessibilityLabel={t('onboarding.accountCurrency')}
          options={[
            { value: 'USD', label: t('currency.USD') },
            { value: 'LBP', label: t('currency.LBP') },
          ]}
        />
        <View style={styles.switchRow}>
          <AppText variant="body" style={styles.flex}>{t('accounts.includeInNetWorth')}</AppText>
          <Switch
            value={includeInNetWorth}
            onValueChange={setIncludeInNetWorth}
            color={tokens.primary}
            accessibilityLabel={t('accounts.includeInNetWorth')}
          />
        </View>
        <AppButton onPress={() => void addAccount()} disabled={loading || !name.trim()} loading={loading}>
          {t('accounts.create')}
        </AppButton>
      </Composer>

      {error ? <Notice tone="error" message={error} /> : null}

      {openingAccount ? (
        <Card style={styles.form}>
          <View style={styles.formHeader}>
            <IconTile icon="scale-balance" tint="info" />
            <View style={styles.flex}>
              <AppText variant="title">{t('accounts.openingBalance')}</AppText>
              <AppText variant="label" tone="muted">{`${openingAccount.name} · ${openingAccount.currency}`}</AppText>
            </View>
          </View>
          <Field label={t('accounts.openingBalanceDate')} value={openingDate} onChangeText={setOpeningDate} icon="calendar-blank-outline" />
          <Field label={t('accounts.openingBalanceAmount')} value={openingAmount} onChangeText={setOpeningAmount} keyboardType="decimal-pad" icon="cash" />
          <Field label={t('accounts.openingBalanceRate')} value={openingRate} onChangeText={setOpeningRate} keyboardType="decimal-pad" icon="swap-horizontal" />
          <View style={styles.buttonRow}>
            <View style={styles.flex}>
              <AppButton variant="secondary" onPress={() => setOpeningAccountId(null)}>{t('common.cancel')}</AppButton>
            </View>
            <View style={styles.flex}>
              <AppButton onPress={() => void saveOpening()} disabled={loading} loading={loading}>{t('common.save')}</AppButton>
            </View>
          </View>
        </Card>
      ) : null}

      <Section title={t('ui.activeAccounts')}>
        {active.length === 0 ? (
          <EmptyState icon="wallet-plus-outline" title={t('ui.noAccounts')} message={t('ui.noAccountsMessage')} />
        ) : (
          active.map((account, index) => (
            <FadeIn key={account.id} index={index + 1}>
              <Card padded={false} style={styles.accountCard}>
                <ListRow
                  title={account.name}
                  subtitle={`${t(`account.type.${account.type}`)} · ${account.currency}`}
                  leading={<IconTile icon={accountIcon(account.type)} tint="primary" />}
                  trailing={<Amount minor={account.balanceMinor} currency={account.currency} />}
                  trailingCaption={t('accounts.balance')}
                  chevron
                  onPress={() => router.push(`/accounts/${account.id}` as Href)}
                  accessibilityHint={t('accounts.ledger')}
                />
                {!account.includeInNetWorth ? (
                  <View style={styles.badgeRow}>
                    <Badge label={t('ui.notInNetWorth')} icon="eye-off-outline" />
                  </View>
                ) : null}
                <Divider />
                <View style={styles.actions}>
                  <AppButton variant="ghost" size="sm" icon="scale-balance" onPress={() => void beginOpening(account)}>
                    {t('accounts.openingBalance')}
                  </AppButton>
                  <AppButton variant="ghost" size="sm" icon="archive-arrow-down-outline" onPress={() => setArchiving(account)} textColor={tokens.textSecondary}>
                    {t('accounts.archive')}
                  </AppButton>
                </View>
              </Card>
            </FadeIn>
          ))
        )}
      </Section>

      {archived.length > 0 ? (
        <Section title={t('ui.archived')}>
          <Card padded={false} variant="outline">
            {archived.map((account, index) => (
              <View key={account.id}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  dense
                  title={account.name}
                  subtitle={`${t(`account.type.${account.type}`)} · ${account.currency}`}
                  leading={<IconTile icon="archive-outline" tint="neutral" size={32} />}
                  trailing={<Amount minor={account.balanceMinor} currency={account.currency} tone="muted" />}
                  onPress={() => router.push(`/accounts/${account.id}` as Href)}
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <ConfirmDialog
        visible={archiving !== null}
        icon="archive-arrow-down-outline"
        title={t('accounts.archive')}
        message={archiving ? t('ui.archiveAccountMessage', { name: archiving.name }) : undefined}
        confirmLabel={t('accounts.archive')}
        cancelLabel={t('common.cancel')}
        destructive={false}
        onConfirm={() => archiving && void archive(archiving.id)}
        onDismiss={() => setArchiving(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  form: { gap: spacing.xs },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  accountCard: { overflow: 'hidden' },
  badgeRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, marginTop: -spacing.xs, paddingStart: 68 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xs, padding: spacing.xs },
});
