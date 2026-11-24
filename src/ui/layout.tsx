import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing, useTokens } from '@/ui/theme';

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.wideBreakpoint;
  return {
    width,
    isWide,
    gutter: width >= 600 ? spacing.xxl : spacing.lg,
    maxWidth: isWide ? layout.wideMaxContentWidth : layout.maxContentWidth,
  };
}

/** Centers content in a readable column and applies the screen gutter. */
export function useContentContainerStyle(extra?: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  const { gutter, maxWidth } = useResponsive();
  return [
    {
      width: '100%',
      maxWidth,
      alignSelf: 'center',
      paddingHorizontal: gutter,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxxl * 2,
      gap: spacing.xl,
    },
    extra,
  ];
}

type ScreenProps = Omit<ScrollViewProps, 'refreshControl'> & {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Adds the top safe-area inset (for screens rendered without a navigation header). */
  edgeTop?: boolean;
  footer?: ReactNode;
};

export function Screen({
  children,
  refreshing,
  onRefresh,
  edgeTop = false,
  footer,
  contentContainerStyle,
  ...props
}: ScreenProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const container = useContentContainerStyle([
    edgeTop ? { paddingTop: insets.top + spacing.lg } : null,
    contentContainerStyle,
  ]);
  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={container}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              colors={[tokens.primary]}
              progressBackgroundColor={tokens.surface}
              tintColor={tokens.primary}
            />
          ) : undefined
        }
        {...props}
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

/** A pinned bottom action bar (e.g. a form's Save button) that respects the home indicator. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { gutter, maxWidth } = useResponsive();
  return (
    <View
      style={[
        styles.footer,
        {
          backgroundColor: tokens.bg,
          borderTopColor: tokens.border,
          paddingBottom: Math.max(insets.bottom, spacing.md),
          paddingHorizontal: gutter,
        },
      ]}
    >
      <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: spacing.sm }}>{children}</View>
    </View>
  );
}

/** Two columns on wide screens, a single stack on phones. */
export function Columns({ left, right }: { left: ReactNode; right: ReactNode }) {
  const { isWide } = useResponsive();
  if (!isWide) {
    return (
      <>
        {left}
        {right}
      </>
    );
  }
  return (
    <View style={styles.columns}>
      <View style={styles.column}>{left}</View>
      <View style={styles.column}>{right}</View>
    </View>
  );
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** Gentle rise-and-fade entrance. Staggers by `index`; skipped when reduce-motion is on. */
export function FadeIn({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 8) * 45,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, reduced]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  columns: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  column: { flex: 1, gap: spacing.xl, minWidth: 0 },
});
