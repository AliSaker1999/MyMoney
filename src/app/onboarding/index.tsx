import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDatabase } from '@/db/DatabaseProvider';
import { completeOnboarding, DEFAULT_CATEGORIES } from '@/services/onboardingService';
import type {
  AccountCurrency,
  AccountType,
  RateSourceCode,
} from '@/services/onboardingService';
import { parseRate } from '@/domain/money';
import { normalizeLanguage, type AppLanguage } from '@/i18n/language';
import { useAppSecuritySettings } from '@/security/AppSecurityGate';
import {
  accountIcon,
  AppButton,
  AppText,
  Card,
  categoryIcon,
  categoryLabel,
  ChoiceChips,
  FadeIn,
  Field,
  IconTile,
  Notice,
  OptionCard,
  Screen,
  SegmentedControl,
  spacing,
  StickyFooter,
  useTokens,
} from '@/ui';

const STEPS = [
  'onboarding.languageTitle',
  'onboarding.securityTitle',
  'onboarding.restoreTitle',
  'onboarding.rateTitle',
  'onboarding.accountName',
  'onboarding.categoriesTitle',
] as const;

const LANGUAGES: readonly AppLanguage[] = ['en', 'ar'];
const RATE_SOURCES: readonly RateSourceCode[] = ['market', 'official', 'custom'];
const ACCOUNT_TYPES: readonly AccountType[] = [
  'cash',
  'bank',
  'card',
  'wallet',
  'savings',
  'other',
];
const CURRENCIES: readonly AccountCurrency[] = ['USD', 'LBP'];

export default function OnboardingScreen() {
  const { i18n, t } = useTranslation();
  const database = useDatabase();
  const tokens = useTokens();
  const { settings, updateSettings } = useAppSecuritySettings();
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<AppLanguage>(
    settings.language ?? normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
  );
  const [rateSource, setRateSource] = useState<RateSourceCode>('market');
  const [rateText, setRateText] = useState('');
  const [rateDate, setRateDate] = useState(todayLocal());
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('cash');
  const [accountCurrency, setAccountCurrency] = useState<AccountCurrency>('USD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeLanguage = async (nextLanguage: AppLanguage) => {
    setBusy(true);
    setError(null);
    try {
      await updateSettings({ ...settings, language: nextLanguage });
      setLanguage(nextLanguage);
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    setError(null);
    if (step === 3) {
      try {
        parseRate(rateText);
      } catch {
        setError(t('onboarding.invalidRate'));
        return;
      }
      if (!isIsoDate(rateDate)) {
        setError(t('onboarding.invalidDate'));
        return;
      }
    }
    if (step === 4 && accountName.trim().length === 0) {
      setError(t('onboarding.validationError'));
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding(database, {
        rateSource,
        rateDate,
        rateE4: parseRate(rateText),
        accountName,
        accountType,
        accountCurrency,
      });
      router.replace('/' as Href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const showContinue = step > 0 && step !== 2 && step < 5;

  return (
    <Screen
      edgeTop
      footer={
        step > 0 ? (
          <StickyFooter>
            <View style={styles.navigation}>
              <View style={styles.flex}>
                <AppButton variant="secondary" icon="arrow-left" disabled={busy} onPress={() => setStep((current) => current - 1)}>
                  {t('onboarding.back')}
                </AppButton>
              </View>
              {showContinue ? (
                <View style={styles.flex}>
                  <AppButton disabled={busy} onPress={() => void advance()}>
                    {t('onboarding.continue')}
                  </AppButton>
                </View>
              ) : null}
              {step === 5 ? (
                <View style={styles.flex}>
                  <AppButton disabled={busy} loading={busy} icon="check" onPress={() => void finish()}>
                    {t('onboarding.finish')}
                  </AppButton>
                </View>
              ) : null}
            </View>
          </StickyFooter>
        ) : null
      }
    >
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
        {STEPS.map((key, index) => (
          <View
            key={key}
            style={[styles.progressSegment, { backgroundColor: index <= step ? tokens.primary : tokens.track }]}
          />
        ))}
      </View>
      <AppText variant="label" tone="muted">
        {t('onboarding.progress', { step: step + 1, total: STEPS.length })}
      </AppText>

      {step === 0 ? (
        <View style={styles.brand}>
          <IconTile icon="wallet-outline" size={64} />
          <AppText variant="h1">{t('app.title')}</AppText>
          <AppText variant="body" tone="secondary">{t('app.subtitle')}</AppText>
        </View>
      ) : null}

      <FadeIn key={step}>
        <View style={styles.step}>
          <AppText variant={step === 0 ? 'h2' : 'h1'} accessibilityRole="header">
            {t(STEPS[step] ?? STEPS[0])}
          </AppText>

          {step === 0 ? (
            <View style={styles.options}>
              <AppText variant="body" tone="secondary">{t('onboarding.languageDescription')}</AppText>
              {LANGUAGES.map((item) => (
                <OptionCard
                  key={item}
                  label={t(item === 'en' ? 'language.english' : 'language.arabic')}
                  description={item === 'en' ? 'English' : 'العربية'}
                  icon="translate"
                  selected={language === item}
                  disabled={busy}
                  onPress={() => void changeLanguage(item)}
                />
              ))}
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.options}>
              <Card variant="muted" style={styles.featureCard}>
                <IconTile icon="fingerprint" size={48} />
                <AppText variant="body" tone="secondary" style={styles.flex}>
                  {t('onboarding.securityDescription')}
                </AppText>
              </Card>
              <AppButton variant="secondary" icon="shield-lock-outline" onPress={() => router.push('/settings/security' as Href)}>
                {t('onboarding.securitySettings')}
              </AppButton>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.options}>
              <AppText variant="body" tone="secondary">{t('onboarding.restoreDescription')}</AppText>
              <OptionCard
                role="button"
                label={t('onboarding.startNew')}
                icon="notebook-plus-outline"
                selected={false}
                onPress={() => setStep(3)}
              />
              <OptionCard
                role="button"
                label={t('onboarding.restoreBackup')}
                icon="file-restore-outline"
                selected={false}
                onPress={() => router.push('/backup' as Href)}
              />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.options}>
              <AppText variant="body" tone="secondary">{t('onboarding.rateDescription')}</AppText>
              <Field
                label={t('onboarding.rateValue')}
                value={rateText}
                onChangeText={setRateText}
                keyboardType="decimal-pad"
                autoCorrect={false}
                icon="swap-horizontal"
              />
              <Field
                label={t('onboarding.rateDate')}
                value={rateDate}
                onChangeText={setRateDate}
                autoCorrect={false}
                icon="calendar-blank-outline"
              />
              <AppText variant="label" tone="secondary">{t('onboarding.preferredRateSource')}</AppText>
              <ChoiceChips
                value={rateSource}
                onChange={(value) => value && setRateSource(value)}
                accessibilityLabel={t('onboarding.preferredRateSource')}
                options={RATE_SOURCES.map((source) => ({
                  value: source,
                  label: t(`rateSource.${source}`),
                  icon: source === 'market' ? 'store-outline' : source === 'official' ? 'bank-outline' : 'pencil-outline',
                }))}
              />
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.options}>
              <Field
                label={t('onboarding.accountName')}
                value={accountName}
                onChangeText={setAccountName}
                autoCorrect={false}
                icon="wallet-outline"
              />
              <AppText variant="label" tone="secondary">{t('onboarding.accountType')}</AppText>
              <ChoiceChips
                value={accountType}
                onChange={(value) => value && setAccountType(value)}
                accessibilityLabel={t('onboarding.accountType')}
                options={ACCOUNT_TYPES.map((type) => ({ value: type, label: t(`account.type.${type}`), icon: accountIcon(type) }))}
              />
              <AppText variant="label" tone="secondary">{t('onboarding.accountCurrency')}</AppText>
              <SegmentedControl
                value={accountCurrency}
                onChange={setAccountCurrency}
                accessibilityLabel={t('onboarding.accountCurrency')}
                options={CURRENCIES.map((currency) => ({ value: currency, label: t(`account.currency.${currency}`) }))}
              />
            </View>
          ) : null}

          {step === 5 ? (
            <View style={styles.options}>
              <AppText variant="body" tone="secondary">{t('onboarding.categoriesDescription')}</AppText>
              <View style={styles.categoryGrid}>
                {DEFAULT_CATEGORIES.map((category) => (
                  <View key={category.builtinKey} style={[styles.categoryChip, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
                    <IconTile icon={categoryIcon(category.builtinKey, category.kind)} tint={category.kind === 'income' ? 'positive' : 'primary'} size={28} />
                    <AppText variant="label" style={styles.semibold}>{categoryLabel(t, null, category.builtinKey)}</AppText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {error ? <Notice tone="error" message={error} /> : null}
          {busy && step === 0 ? <ActivityIndicator color={tokens.primary} /> : null}
        </View>
      </FadeIn>
    </Screen>
  );
}

function todayLocal(): string {
  const date = new Date();
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  semibold: { fontWeight: '600' },
  progress: { flexDirection: 'row', gap: spacing.xs + 2 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  brand: { gap: spacing.sm, paddingVertical: spacing.lg },
  step: { gap: spacing.lg },
  options: { gap: spacing.md },
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingStart: spacing.xs + 2,
    paddingEnd: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  navigation: { flexDirection: 'row', gap: spacing.sm },
});
