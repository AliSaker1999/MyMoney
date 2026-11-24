import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spikeEnabled } from '@/spike/enabled';
import {
  AppText,
  Columns,
  FadeIn,
  IconTile,
  ListGroup,
  ListRow,
  Screen,
  Section,
  spacing,
  type Tint,
} from '@/ui';

interface Destination {
  href: string;
  title: string;
  subtitle: string;
  icon: string;
  tint: Tint;
}

export default function MoreScreen() {
  const { t } = useTranslation();

  const planning: Destination[] = [
    { href: '/budgets', title: t('budgets.manageTitle'), subtitle: t('ui.moreBudgets'), icon: 'chart-donut', tint: 'primary' },
    { href: '/goals', title: t('goals.manageTitle'), subtitle: t('ui.moreGoals'), icon: 'flag-checkered', tint: 'positive' },
    { href: '/debts', title: t('debts.manageTitle'), subtitle: t('ui.moreDebts'), icon: 'handshake-outline', tint: 'warning' },
  ];
  const setup: Destination[] = [
    { href: '/accounts', title: t('accounts.manageTitle'), subtitle: t('ui.moreAccounts'), icon: 'wallet-outline', tint: 'primary' },
    { href: '/categories', title: t('categories.manageTitle'), subtitle: t('ui.moreCategories'), icon: 'shape-outline', tint: 'info' },
    { href: '/rates', title: t('rates.manageTitle'), subtitle: t('ui.moreRates'), icon: 'swap-horizontal-circle-outline', tint: 'warning' },
  ];
  const data: Destination[] = [
    { href: '/settings/security', title: t('security.settings'), subtitle: t('ui.moreSecurity'), icon: 'shield-lock-outline', tint: 'primary' },
    { href: '/backup', title: t('backup.title'), subtitle: t('ui.moreBackup'), icon: 'cloud-lock-outline', tint: 'info' },
    { href: '/data-health', title: t('dataHealth.title'), subtitle: t('ui.moreDataHealth'), icon: 'stethoscope', tint: 'positive' },
  ];
  if (spikeEnabled) {
    data.push({ href: '/spike', title: t('app.openSpike'), subtitle: 'M0', icon: 'flask-outline', tint: 'neutral' });
  }

  const group = (title: string, items: Destination[], index: number) => (
    <FadeIn index={index}>
      <Section title={title}>
        <ListGroup>
          {items.map((item) => (
            <ListRow
              key={item.href}
              title={item.title}
              subtitle={item.subtitle}
              leading={<IconTile icon={item.icon} tint={item.tint} />}
              chevron
              onPress={() => router.push(item.href as Href)}
              accessibilityLabel={item.title}
              accessibilityHint={item.subtitle}
            />
          ))}
        </ListGroup>
      </Section>
    </FadeIn>
  );

  return (
    <Screen>
      <Columns
        left={
          <>
            {group(t('ui.planning'), planning, 0)}
            {group(t('ui.ledgerSetup'), setup, 1)}
          </>
        }
        right={group(t('ui.dataAndSecurity'), data, 2)}
      />
      <View style={styles.footer}>
        <IconTile icon="lock-check-outline" tint="neutral" size={32} />
        <AppText variant="caption" tone="muted" align="center">
          {t('app.subtitle')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
});
