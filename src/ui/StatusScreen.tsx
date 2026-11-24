import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { IconTile, type Tint } from '@/ui/surfaces';
import { spacing, useTokens } from '@/ui/theme';

/** Full-screen centered state used for boot, lock, and fatal-error moments. */
export function StatusScreen({
  icon,
  tint = 'primary',
  title,
  message,
  loading = false,
  children,
  overlay = false,
}: {
  icon?: string;
  tint?: Tint;
  title?: string;
  message?: string | null;
  loading?: boolean;
  children?: ReactNode;
  overlay?: boolean;
}) {
  const tokens = useTokens();
  return (
    <View style={[overlay ? styles.overlay : styles.fill, { backgroundColor: tokens.bg }]}>
      <View style={styles.content}>
        {icon ? <IconTile icon={icon} tint={tint} size={72} /> : null}
        {title ? (
          <AppText variant="h2" align="center" accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {message ? (
          <AppText variant="body" tone="secondary" align="center">
            {message}
          </AppText>
        ) : null}
        {loading ? <ActivityIndicator color={tokens.primary} size="large" /> : null}
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    zIndex: 1000,
    elevation: 1000,
  },
  content: { width: '100%', maxWidth: 360, alignItems: 'center', gap: spacing.md },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
