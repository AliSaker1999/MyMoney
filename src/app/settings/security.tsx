import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Switch } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { useAppSecuritySettings } from '@/security/AppSecurityGate';
import {
  AppText,
  Card,
  errorText,
  IconTile,
  Notice,
  OptionCard,
  Screen,
  Section,
  spacing,
  useTokens,
} from '@/ui';

const timeoutOptions = [
  { value: 'immediate', label: 'security.timeoutImmediate' },
  { value: 60_000, label: 'security.timeoutOneMinute' },
  { value: 300_000, label: 'security.timeoutFiveMinutes' },
  { value: 900_000, label: 'security.timeoutFifteenMinutes' },
] as const;

export default function SecuritySettingsScreen() {
  const { t } = useTranslation();
  const tokens = useTokens();
  const { settings, updateSettings } = useAppSecuritySettings();
  const [error, setError] = useState<string | null>(null);

  const update = async (next: typeof settings) => {
    setError(null);
    try {
      await updateSettings(next);
    } catch (cause) {
      setError(errorText(cause, t('common.error')));
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('security.settingsTitle') }} />

      <Card style={styles.lockCard}>
        <IconTile icon={settings.appLockEnabled ? 'lock-outline' : 'lock-open-variant-outline'} tint={settings.appLockEnabled ? 'primary' : 'neutral'} size={44} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t('security.appLock')}</AppText>
          <AppText variant="label" tone="secondary">{t('onboarding.securityDescription')}</AppText>
        </View>
        <Switch
          value={settings.appLockEnabled}
          color={tokens.primary}
          accessibilityLabel={t('security.appLock')}
          onValueChange={(appLockEnabled) => void update({ ...settings, appLockEnabled })}
        />
      </Card>

      <Section title={t('ui.autoLock')} caption={t('security.autoLockDescription')}>
        <View style={styles.options} accessibilityRole="radiogroup">
          {timeoutOptions.map((option) => (
            <OptionCard
              key={String(option.value)}
              label={t(option.label)}
              icon={option.value === 'immediate' ? 'flash-outline' : 'timer-outline'}
              selected={settings.autoLockTimeout === option.value}
              onPress={() => void update({ ...settings, autoLockTimeout: option.value })}
            />
          ))}
        </View>
      </Section>

      {error ? <Notice tone="error" message={error} /> : null}

      <Notice tone="info" title={t('ui.privacyTitle')} message={t('ui.privacyMessage')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  options: { gap: spacing.sm },
});
