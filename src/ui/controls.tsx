import type { ComponentProps, ReactNode } from 'react';
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Button, Dialog, HelperText, Icon, Portal, TextInput } from 'react-native-paper';

import { AppText } from '@/ui/AppText';
import { radius, spacing, type, useAppTheme, useTokens } from '@/ui/theme';

/* -------------------------------------------------------------------------------------------- */
/* Buttons                                                                                        */
/* -------------------------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger' | 'dangerGhost';

type AppButtonProps = Omit<ComponentProps<typeof Button>, 'mode' | 'children'> & {
  variant?: ButtonVariant;
  children: string;
  size?: 'md' | 'sm';
  fullWidth?: boolean;
};

export function AppButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  style,
  contentStyle,
  labelStyle,
  ...props
}: AppButtonProps) {
  const tokens = useTokens();
  const map = {
    primary: { mode: 'contained' as const, buttonColor: tokens.primary, textColor: tokens.onPrimary },
    secondary: { mode: 'outlined' as const, buttonColor: tokens.surface, textColor: tokens.text },
    tonal: { mode: 'contained-tonal' as const, buttonColor: tokens.primarySoft, textColor: tokens.onPrimarySoft },
    ghost: { mode: 'text' as const, buttonColor: undefined, textColor: tokens.primary },
    danger: { mode: 'contained' as const, buttonColor: tokens.negative, textColor: '#FFFFFF' },
    dangerGhost: { mode: 'text' as const, buttonColor: undefined, textColor: tokens.negative },
  }[variant];
  return (
    <Button
      mode={map.mode}
      buttonColor={map.buttonColor}
      textColor={map.textColor}
      accessibilityLabel={props.accessibilityLabel ?? props.children}
      style={[
        styles.button,
        variant === 'secondary' ? { borderColor: tokens.borderStrong } : null,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
      contentStyle={[size === 'md' ? styles.buttonContent : styles.buttonContentSm, contentStyle]}
      labelStyle={[styles.buttonLabel, size === 'sm' ? styles.buttonLabelSm : null, labelStyle]}
      {...props}
    />
  );
}

/** Round icon button with a soft fill; used for header and inline row actions. */
export function IconAction({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'neutral',
  disabled,
  size = 40,
}: {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'neutral' | 'primary' | 'danger';
  disabled?: boolean;
  size?: number;
}) {
  const tokens = useTokens();
  const color = tone === 'danger' ? tokens.negative : tone === 'primary' ? tokens.primary : tokens.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      android_ripple={{ color: tokens.surfaceSunken, borderless: true, radius: size / 2 }}
      style={({ pressed }) => [
        styles.iconAction,
        { width: Math.max(size, 44), height: Math.max(size, 44), borderRadius: size },
        pressed ? { backgroundColor: tokens.surfaceMuted } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Icon source={icon} size={20} color={color} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Text fields                                                                                    */
/* -------------------------------------------------------------------------------------------- */

type FieldProps = Omit<ComponentProps<typeof TextInput>, 'mode' | 'error'> & {
  helper?: string;
  errorText?: string | null;
  icon?: string;
};

export function Field({ helper, errorText, icon, style, ...props }: FieldProps) {
  const tokens = useTokens();
  return (
    <View>
      <TextInput
        mode="outlined"
        accessibilityLabel={props.accessibilityLabel ?? (typeof props.label === 'string' ? props.label : undefined)}
        outlineStyle={styles.fieldOutline}
        outlineColor={tokens.border}
        activeOutlineColor={tokens.primary}
        textColor={tokens.text}
        placeholderTextColor={tokens.textMuted}
        style={[styles.field, { backgroundColor: tokens.surface }, style]}
        left={icon ? <TextInput.Icon icon={icon} color={tokens.textMuted} /> : undefined}
        error={Boolean(errorText)}
        {...props}
      />
      {errorText ? (
        <HelperText type="error" visible>
          {errorText}
        </HelperText>
      ) : helper ? (
        <HelperText type="info" visible style={{ color: tokens.textMuted }}>
          {helper}
        </HelperText>
      ) : null}
    </View>
  );
}

/** A large, centered amount input used at the top of money-entry forms. */
export function AmountField({
  value,
  onChangeText,
  currency,
  label,
  tone = 'default',
}: {
  value: string;
  onChangeText: (value: string) => void;
  currency?: string;
  label: string;
  tone?: 'default' | 'positive';
}) {
  const tokens = useTokens();
  return (
    <View style={[styles.amountField, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
      <AppText variant="overline" tone="muted" uppercase>
        {label}
      </AppText>
      <View style={styles.amountRow}>
        <TextInput
          mode="flat"
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={label}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          placeholderTextColor={tokens.textMuted}
          textColor={tone === 'positive' ? tokens.positive : tokens.text}
          selectionColor={tokens.primary}
          style={[styles.amountInput, { backgroundColor: 'transparent' }]}
          contentStyle={styles.amountInputContent}
        />
        {currency ? (
          <View style={[styles.currencyPill, { backgroundColor: tokens.surfaceMuted }]}>
            <AppText variant="label" tone="secondary" style={styles.semibold}>
              {currency}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Selection                                                                                      */
/* -------------------------------------------------------------------------------------------- */

export interface Choice<T extends string> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
  description?: string;
}

/** Segmented control for 2–4 mutually exclusive options. Direction-agnostic, so it mirrors in RTL. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly Choice<T>[];
  accessibilityLabel?: string;
}) {
  const tokens = useTokens();
  const theme = useAppTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: tokens.surfaceSunken }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled: option.disabled }}
            accessibilityLabel={option.label}
            style={[
              styles.segment,
              selected
                ? [
                    { backgroundColor: theme.isDark ? tokens.surfaceMuted : tokens.surface },
                    theme.isDark ? null : styles.segmentThumbShadow,
                  ]
                : null,
            ]}
          >
            {option.icon ? (
              <Icon source={option.icon} size={16} color={selected ? tokens.text : tokens.textMuted} />
            ) : null}
            <AppText
              variant="label"
              numberOfLines={1}
              style={[styles.semibold, { color: selected ? tokens.text : tokens.textSecondary }]}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping (or horizontally scrolling) single-select chips. Scales to any number of options. */
export function ChoiceChips<T extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
  scroll = false,
  allowDeselect = false,
}: {
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly Choice<T>[];
  accessibilityLabel?: string;
  scroll?: boolean;
  allowDeselect?: boolean;
}) {
  const tokens = useTokens();
  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        onPress={() => onChange(selected && allowDeselect ? null : option.value)}
        disabled={option.disabled}
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected, disabled: option.disabled }}
        accessibilityLabel={option.label}
        android_ripple={{ color: tokens.surfaceSunken }}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? tokens.primarySoft : tokens.surface,
            borderColor: selected ? tokens.primary : tokens.border,
          },
          option.disabled ? styles.disabled : null,
        ]}
      >
        {option.icon ? (
          <Icon source={option.icon} size={16} color={selected ? tokens.onPrimarySoft : tokens.textSecondary} />
        ) : null}
        <AppText
          variant="label"
          numberOfLines={1}
          style={[styles.semibold, { color: selected ? tokens.onPrimarySoft : tokens.text }]}
        >
          {option.label}
        </AppText>
        {selected ? <Icon source="check" size={14} color={tokens.onPrimarySoft} /> : null}
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={styles.chipsScroll}
      >
        {chips}
      </ScrollView>
    );
  }
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.chips}>
      {chips}
    </View>
  );
}

/** Large selectable option cards (onboarding, settings). */
export function OptionCard({
  label,
  description,
  icon,
  selected,
  onPress,
  disabled,
  role = 'radio',
}: {
  label: string;
  description?: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  role?: 'radio' | 'button';
}) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ selected, checked: selected, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      android_ripple={{ color: tokens.surfaceSunken }}
      style={[
        styles.option,
        {
          backgroundColor: selected ? tokens.primarySoft : tokens.surface,
          borderColor: selected ? tokens.primary : tokens.border,
        },
        disabled ? styles.disabled : null,
      ]}
    >
      {icon ? (
        <View style={[styles.optionIcon, { backgroundColor: selected ? tokens.surface : tokens.surfaceMuted }]}>
          <Icon source={icon} size={20} color={selected ? tokens.primary : tokens.textSecondary} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="label" tone="secondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? tokens.primary : tokens.borderStrong },
          selected ? { backgroundColor: tokens.primary } : null,
        ]}
      >
        {selected ? <Icon source="check" size={14} color={tokens.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Dialogs and disclosure                                                                         */
/* -------------------------------------------------------------------------------------------- */

export function ConfirmDialog({
  visible,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onDismiss,
  destructive = true,
  icon,
}: {
  visible: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  destructive?: boolean;
  icon?: string;
}) {
  const tokens = useTokens();
  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={[styles.dialog, { backgroundColor: tokens.surface }]}
      >
        {icon ? (
          <Dialog.Icon icon={icon} color={destructive ? tokens.negative : tokens.primary} size={28} />
        ) : null}
        <Dialog.Title style={[type.h2, styles.dialogTitle, { color: tokens.text }]}>{title}</Dialog.Title>
        {message || children ? (
          <Dialog.Content style={styles.dialogContent}>
            {message ? (
              <AppText variant="body" tone="secondary">
                {message}
              </AppText>
            ) : null}
            {children}
          </Dialog.Content>
        ) : null}
        <Dialog.Actions style={styles.dialogActions}>
          <AppButton variant="ghost" onPress={onDismiss} size="sm">
            {cancelLabel}
          </AppButton>
          <AppButton variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} size="sm">
            {confirmLabel}
          </AppButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

/** Reveals an inline "create" form behind a single action, keeping list screens calm by default. */
export function Composer({
  open,
  onToggle,
  openLabel,
  closeLabel,
  icon = 'plus',
  title,
  children,
  style,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
  openLabel: string;
  closeLabel: string;
  icon?: string;
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle(!open);
  };
  return (
    <View style={[styles.composer, style]}>
      {open ? (
        <View style={[styles.composerCard, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <View style={styles.composerHeader}>
            {title ? (
              <AppText variant="title" style={styles.flex} accessibilityRole="header">
                {title}
              </AppText>
            ) : (
              <View style={styles.flex} />
            )}
            <IconAction icon="close" onPress={toggle} accessibilityLabel={closeLabel} />
          </View>
          {children}
        </View>
      ) : (
        <AppButton variant="tonal" icon={icon} onPress={toggle} fullWidth>
          {openLabel}
        </AppButton>
      )}
    </View>
  );
}

/** Label/value pair used in detail summaries. */
export function KeyValue({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <View style={styles.keyValue}>
      <AppText variant="label" tone="secondary" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" numeric={numeric} align="right" style={styles.keyValueValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  semibold: { fontWeight: '600' },
  disabled: { opacity: 0.45 },
  fullWidth: { alignSelf: 'stretch' },
  button: { borderRadius: radius.md },
  buttonContent: { minHeight: 48, paddingHorizontal: spacing.sm },
  buttonContentSm: { minHeight: 40 },
  buttonLabel: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1, marginVertical: 0 },
  buttonLabelSm: { fontSize: 14 },
  iconAction: { alignItems: 'center', justifyContent: 'center' },
  field: { fontSize: 15 },
  fieldOutline: { borderRadius: radius.md, borderWidth: 1 },
  amountField: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amountInput: { flex: 1, height: 56, paddingHorizontal: 0 },
  amountInputContent: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
    paddingHorizontal: 0,
    fontVariant: ['tabular-nums'],
  },
  currencyPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4, minHeight: 44 },
  segmentThumbShadow: {
    shadowColor: '#0B1F18',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    minHeight: 36,
    borderRadius: radius.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipsScroll: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
    minHeight: 64,
  },
  optionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: { borderRadius: radius.xl },
  dialogTitle: { textAlign: 'auto' },
  dialogContent: { gap: spacing.sm },
  dialogActions: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  composer: { gap: spacing.md },
  composerCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: spacing.lg,
    gap: spacing.md,
  },
  composerHeader: { flexDirection: 'row', alignItems: 'center', marginTop: -spacing.xs, marginEnd: -spacing.sm },
  keyValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 },
  keyValueValue: { flexShrink: 1 },
});
