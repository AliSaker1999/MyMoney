import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DatabaseBootstrapState, RecoveryCandidateInfo } from '@/db/bootstrap';
import { formatDate } from '@/i18n/formatters';
import { normalizeLanguage } from '@/i18n/language';
import { AppButton, Field } from '@/ui/controls';
import { AppText } from '@/ui/AppText';
import { Screen } from '@/ui/layout';
import { Card, IconTile, ListGroup, ListRow, Notice, Section } from '@/ui/surfaces';
import { spacing } from '@/ui/theme';

interface RecoveryScreenProps {
  state: Extract<DatabaseBootstrapState, { status: 'recovery' }>;
  onUseCandidate: (candidateId: string) => Promise<void>;
  onStartFresh: () => Promise<void>;
  onReset: (confirmation: string) => Promise<void>;
  error: string | null;
}

export function RecoveryScreen({
  state,
  onUseCandidate,
  onStartFresh,
  onReset,
  error,
}: RecoveryScreenProps) {
  const { i18n, t } = useTranslation();
  const [confirmation, setConfirmation] = useState('');
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const reasonKeys = {
    'key-invalid': 'security.recoveryKeyInvalid',
    'key-missing': 'security.recoveryKeyMissing',
    'main-unreadable': 'security.recoveryMainUnreadable',
    'main-missing': 'security.recoveryMainMissing',
  } as const;

  return (
    <Screen edgeTop>
      <View style={styles.header}>
        <IconTile icon="database-alert-outline" tint="warning" size={56} />
        <AppText variant="h1" accessibilityRole="header">{t('security.recoveryTitle')}</AppText>
        <AppText variant="body" tone="secondary">{t(reasonKeys[state.reason])}</AppText>
      </View>

      {error ? <Notice tone="error" message={error} /> : null}

      <Section title={t('ui.recoveryCopies')}>
        {state.candidates.length === 0 ? (
          <Notice tone="info" message={t('security.recoveryNoCandidates')} />
        ) : (
          <ListGroup>
            {state.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                language={language}
                onPress={() => onUseCandidate(candidate.id)}
              />
            ))}
          </ListGroup>
        )}
        {state.issues.map((issue) => (
          <Notice key={issue.candidate.id} tone="warning" message={`${issue.candidate.name}: ${issue.message}`} />
        ))}
      </Section>

      {state.reason === 'main-missing' ? (
        <AppButton variant="tonal" icon="notebook-plus-outline" onPress={() => void onStartFresh()}>
          {t('security.startFresh')}
        </AppButton>
      ) : null}

      <Section title={t('security.resetDatabase')}>
        <Card variant="danger" style={styles.reset}>
          <AppText variant="label" tone="secondary">{t('security.resetInstructions')}</AppText>
          <Field
            label={t('security.resetConfirmation')}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            icon="alert-outline"
          />
          <AppButton
            variant="danger"
            disabled={confirmation !== 'RESET'}
            onPress={() => void onReset(confirmation)}
          >
            {t('security.resetDatabase')}
          </AppButton>
        </Card>
      </Section>
    </Screen>
  );
}

function CandidateRow({
  candidate,
  language,
  onPress,
}: {
  candidate: RecoveryCandidateInfo;
  language: 'en' | 'ar';
  onPress: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const date =
    candidate.modifiedAt === null
      ? t('security.recoveryDateUnknown')
      : formatDate(new Date(candidate.modifiedAt).toISOString().slice(0, 10), language);
  const label = t('security.recoveryCandidate', {
    name: candidate.name,
    source: t(`security.recoverySource.${candidate.source}`),
    date,
    accounts: candidate.rowCounts.accounts,
    transactions: candidate.rowCounts.transactions,
  });

  return (
    <ListRow
      title={candidate.name}
      subtitle={`${t(`security.recoverySource.${candidate.source}`)} · ${date}`}
      trailingCaption={`${candidate.rowCounts.accounts} / ${candidate.rowCounts.transactions}`}
      leading={<IconTile icon="database-refresh-outline" tint="info" />}
      chevron
      accessibilityLabel={label}
      onPress={() => void onPress()}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  reset: { gap: spacing.sm },
});
