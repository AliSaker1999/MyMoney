import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { getAccountLedger } from '@/services/dashboardService';
import { listAccounts } from '@/services/ledgerSetupService';
import {
  accountIcon,
  AppText,
  Badge,
  Card,
  EmptyState,
  errorText,
  IconTile,
  ListGroup,
  moneyText,
  Notice,
  Screen,
  Section,
  spacing,
  useFocusData,
} from '@/ui';
import { TransactionRow } from '@/ui/TransactionRow';

export default function AccountLedgerScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const accountId = Number(id);
    const [transactions, accounts] = await Promise.all([getAccountLedger(database, accountId), listAccounts(database)]);
    return { transactions, account: accounts.find((item) => item.id === accountId) ?? null };
  }, [database, id]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, refreshing, refresh } = useFocusData(load, onError);
  const account = data?.account;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: account?.name ?? t('accounts.ledger') }} />
      {error ? <Notice tone="error" message={error} /> : null}
      {account ? (
        <Card style={styles.summary}>
          <View style={styles.summaryTop}>
            <IconTile icon={accountIcon(account.type)} tint="primary" size={44} />
            <View style={styles.flex}>
              <AppText variant="title">{account.name}</AppText>
              <AppText variant="label" tone="muted">{`${t(`account.type.${account.type}`)} · ${account.currency}`}</AppText>
            </View>
            {account.archivedAt ? <Badge label={t('ui.archived')} icon="archive-outline" /> : null}
          </View>
          <AppText variant="overline" tone="muted" uppercase>{t('accounts.balance')}</AppText>
          <AppText variant="h1" numeric numberOfLines={1} adjustsFontSizeToFit>
            {moneyText(account.balanceMinor, account.currency)}
          </AppText>
        </Card>
      ) : null}
      {data ? (
        <Section title={t('accounts.ledger')}>
          {data.transactions.length === 0 ? (
            <EmptyState icon="receipt-text-outline" title={t('ui.noTransactions')} />
          ) : (
            <ListGroup>
              {data.transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  onPress={() => router.push(`/transactions/${transaction.id}` as Href)}
                />
              ))}
            </ListGroup>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  summary: { gap: spacing.xs },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
});
