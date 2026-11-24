import { Children, isValidElement, useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from 'react-native-paper';

import { AppText, type TextTone } from '@/ui/AppText';
import { cardShadow, radius, spacing, useAppTheme, useTokens, type ColorTokens } from '@/ui/theme';
import { useReducedMotion } from '@/ui/layout';

/* -------------------------------------------------------------------------------------------- */
/* Pressable with a subtle scale + ripple; the shared micro-interaction for tappable surfaces.   */
/* -------------------------------------------------------------------------------------------- */

export function PressableScale({
  children,
  style,
  disabled,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const animateTo = (value: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled ? styles.disabled : null]}>
      <Pressable
        {...props}
        disabled={disabled}
        android_ripple={{ color: tokens.surfaceSunken, foreground: true }}
        onPressIn={(event) => {
          animateTo(0.985);
          props.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animateTo(1);
          props.onPressOut?.(event);
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Card                                                                                          */
/* -------------------------------------------------------------------------------------------- */

type CardVariant = 'default' | 'muted' | 'hero' | 'outline' | 'danger';

function cardColors(tokens: ColorTokens, variant: CardVariant) {
  switch (variant) {
    case 'muted': return { backgroundColor: tokens.surfaceMuted, borderColor: tokens.surfaceMuted };
    case 'hero': return { backgroundColor: tokens.hero, borderColor: tokens.hero };
    case 'outline': return { backgroundColor: 'transparent', borderColor: tokens.border };
    case 'danger': return { backgroundColor: tokens.surface, borderColor: tokens.negativeSoft };
    default: return { backgroundColor: tokens.surface, borderColor: tokens.border };
  }
}

export function Card({
  children,
  variant = 'default',
  padded = true,
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  children: ReactNode;
  variant?: CardVariant;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  const cardStyle = [
    styles.card,
    cardColors(theme.tokens, variant),
    variant === 'default' ? cardShadow(theme.isDark) : null,
    padded ? styles.cardPadded : null,
    style,
  ];
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        style={[cardStyle, styles.clip]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <View style={cardStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Section header                                                                                */
/* -------------------------------------------------------------------------------------------- */

export function Section({
  title,
  caption,
  action,
  children,
  style,
}: {
  title?: string;
  caption?: string;
  action?: { label: string; onPress: () => void; accessibilityHint?: string };
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  return (
    <View style={[styles.section, style]}>
      {title || action ? (
        <View style={styles.sectionHeader}>
          <View style={styles.flex}>
            {title ? (
              <AppText variant="title" accessibilityRole="header">
                {title}
              </AppText>
            ) : null}
            {caption ? (
              <AppText variant="caption" tone="muted">
                {caption}
              </AppText>
            ) : null}
          </View>
          {action ? (
            <Pressable
              onPress={action.onPress}
              hitSlop={12}
              accessibilityRole="link"
              accessibilityHint={action.accessibilityHint}
              style={({ pressed }) => [styles.sectionAction, pressed ? { backgroundColor: tokens.primarySoft } : null]}
            >
              <AppText variant="label" tone="primary" style={styles.semibold}>
                {action.label}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Icon tile, badge, avatar                                                                       */
/* -------------------------------------------------------------------------------------------- */

export type Tint = 'primary' | 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'hero';

export function tintColors(tokens: ColorTokens, tint: Tint): { bg: string; fg: string } {
  switch (tint) {
    case 'positive': return { bg: tokens.positiveSoft, fg: tokens.positive };
    case 'negative': return { bg: tokens.negativeSoft, fg: tokens.negative };
    case 'warning': return { bg: tokens.warningSoft, fg: tokens.warning };
    case 'info': return { bg: tokens.infoSoft, fg: tokens.info };
    case 'neutral': return { bg: tokens.surfaceMuted, fg: tokens.textSecondary };
    case 'hero': return { bg: tokens.heroChip, fg: tokens.heroText };
    default: return { bg: tokens.primarySoft, fg: tokens.onPrimarySoft };
  }
}

export function IconTile({ icon, tint = 'primary', size = 40 }: { icon: string; tint?: Tint; size?: number }) {
  const tokens = useTokens();
  const colors = tintColors(tokens, tint);
  return (
    <View
      style={[styles.iconTile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: colors.bg }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Icon source={icon} size={Math.round(size * 0.5)} color={colors.fg} />
    </View>
  );
}

export function Avatar({ label, tint = 'neutral', size = 40 }: { label: string; tint?: Tint; size?: number }) {
  const tokens = useTokens();
  const colors = tintColors(tokens, tint);
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[styles.iconTile, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <AppText variant="title" style={{ color: colors.fg }}>
        {initial}
      </AppText>
    </View>
  );
}

export function Badge({ label, tint = 'neutral', icon }: { label: string; tint?: Tint; icon?: string }) {
  const tokens = useTokens();
  const colors = tintColors(tokens, tint);
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      {icon ? <Icon source={icon} size={12} color={colors.fg} /> : null}
      <AppText variant="caption" style={[styles.semibold, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Lists                                                                                          */
/* -------------------------------------------------------------------------------------------- */

/** A card that draws hairline dividers between its rows. */
export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <Card padded={false} style={[styles.clip, style]}>
      {items.map((child, index) => (
        <View key={child.key ?? index}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: tokens.border }]} /> : null}
          {child}
        </View>
      ))}
    </Card>
  );
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  trailingCaption,
  chevron = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  titleTone,
  testID,
  dense = false,
}: {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  trailingCaption?: string | null;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  titleTone?: TextTone;
  testID?: string;
  dense?: boolean;
}) {
  const tokens = useTokens();
  const content = (
    <View style={[styles.row, dense ? styles.rowDense : null]}>
      {leading}
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" tone={titleTone} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="muted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing || trailingCaption ? (
        <View style={styles.rowTrailing}>
          {typeof trailing === 'string' ? <AppText variant="bodyStrong">{trailing}</AppText> : trailing}
          {trailingCaption ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {trailingCaption}
            </AppText>
          ) : null}
        </View>
      ) : null}
      {chevron ? <Icon source="chevron-right" size={20} color={tokens.textMuted} /> : null}
    </View>
  );
  if (!onPress && !onLongPress) return content;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: tokens.surfaceSunken }}
      style={({ pressed }) => (pressed ? { backgroundColor: tokens.surfaceMuted } : null)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Feedback                                                                                       */
/* -------------------------------------------------------------------------------------------- */

const NOTICE_ICONS = {
  error: 'alert-circle-outline',
  success: 'check-circle-outline',
  warning: 'alert-outline',
  info: 'information-outline',
} as const;

export function Notice({
  tone = 'info',
  title,
  message,
  children,
}: {
  tone?: keyof typeof NOTICE_ICONS;
  title?: string;
  message?: string | null;
  children?: ReactNode;
}) {
  const tokens = useTokens();
  const tint: Tint = tone === 'error' ? 'negative' : tone === 'success' ? 'positive' : tone;
  const colors = tintColors(tokens, tint);
  return (
    <View
      style={[styles.notice, { backgroundColor: colors.bg }]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    >
      <Icon source={NOTICE_ICONS[tone]} size={20} color={colors.fg} />
      <View style={styles.flex}>
        {title ? (
          <AppText variant="bodyStrong" style={{ color: colors.fg }}>
            {title}
          </AppText>
        ) : null}
        {message ? (
          <AppText variant="label" style={{ color: title ? tokens.textSecondary : colors.fg }}>
            {message}
          </AppText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  compact = false,
}: {
  icon: string;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const tokens = useTokens();
  return (
    <View
      style={[
        styles.empty,
        { borderColor: tokens.border },
        compact ? styles.emptyCompact : null,
      ]}
    >
      <IconTile icon={icon} tint="neutral" size={compact ? 40 : 52} />
      <AppText variant="bodyStrong" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="label" tone="muted" align="center" style={styles.emptyMessage}>
          {message}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Stat tile                                                                                      */
/* -------------------------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  caption,
  icon,
  tint = 'neutral',
  valueTone,
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: string;
  tint?: Tint;
  valueTone?: TextTone;
}) {
  return (
    <Card style={styles.stat}>
      <View style={styles.statHeader}>
        {icon ? <IconTile icon={icon} tint={tint} size={28} /> : null}
        <AppText variant="label" tone="secondary" numberOfLines={1} style={styles.flex}>
          {label}
        </AppText>
      </View>
      <AppText variant="h2" numeric tone={valueTone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      {caption ? (
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {caption}
        </AppText>
      ) : null}
    </Card>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  return <View style={[styles.divider, styles.dividerFull, { backgroundColor: tokens.border }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  semibold: { fontWeight: '600' },
  disabled: { opacity: 0.5 },
  clip: { overflow: 'hidden' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
  cardPadded: { padding: spacing.lg, gap: spacing.md },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  sectionAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  divider: { height: StyleSheet.hairlineWidth * 2, marginStart: 68 },
  dividerFull: { marginStart: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  rowDense: { minHeight: 52, paddingVertical: spacing.sm },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTrailing: { alignItems: 'flex-end', gap: 2, maxWidth: '50%' },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderStyle: 'dashed',
  },
  emptyCompact: { paddingVertical: spacing.xl },
  emptyMessage: { maxWidth: 320 },
  stat: { flex: 1, minWidth: 140, gap: spacing.sm },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
