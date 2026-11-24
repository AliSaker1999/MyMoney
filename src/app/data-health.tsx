import { router, Stack, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { runDataHealth } from '@/services/dashboardService';
import {
  AppButton,
  AppText,
  Card,
  errorText,
  IconTile,
  ListGroup,
  ListRow,
  Notice,
  Screen,
  Section,
  spacing,
  useFocusData,
  useTokens,
} from '@/ui';

export default function DataHealthScreen() {
  const { t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const issues = await runDataHealth(database);
    setError(null);
    return { issues, checkedAt: new Date() };
  }, [database]);
  const onError = useCallback((cause: unknown) => setError(errorText(cause, t('common.error'))), [t]);
  const { data, refreshing, refresh } = useFocusData(load, onError);
  const issues = data?.issues ?? [];
  const healthy = data !== null && issues.length === 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('dataHealth.title') }} />
      {error ? <Notice tone="error" message={error} /> : null}

      {data ? (
        <Card style={styles.status}>
          <IconTile
            icon={healthy ? 'shield-check-outline' : 'shield-alert-outline'}
            tint={healthy ? 'positive' : 'negative'}
            size={64}
          />
          <AppText variant="h2" align="center">
            {healthy ? t('dataHealth.healthy') : t('ui.issuesFound', { count: issues.length })}
          </AppText>
          <AppText variant="label" tone="muted" align="center">
            {t('ui.dataHealthChecks')}
          </AppText>
          <View style={[styles.stamp, { backgroundColor: tokens.surfaceMuted }]}>
            <AppText variant="caption" tone="secondary">
              {t('ui.checkedAt', { time: data.checkedAt.toLocaleTimeString() })}
            </AppText>
          </View>
          <AppButton variant="secondary" icon="refresh" size="sm" onPress={refresh} loading={refreshing}>
            {t('ui.runAgain')}
          </AppButton>
        </Card>
      ) : null}

      {issues.length > 0 ? (
        <Section title={t('ui.issues')}>
          <ListGroup>
            {issues.map((issue, index) => (
              <ListRow
                key={`${issue.rule}-${index}`}
                title={issue.rule}
                subtitle={issue.transactionId ? t('ui.transactionNumber', { id: issue.transactionId }) : null}
                leading={<IconTile icon="alert-circle-outline" tint="negative" />}
                chevron={Boolean(issue.transactionId)}
                onPress={
                  issue.transactionId
                    ? () => router.push(`/transactions/${issue.transactionId}` as Href)
                    : undefined
                }
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  stamp: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 999, marginVertical: spacing.xs },
});
