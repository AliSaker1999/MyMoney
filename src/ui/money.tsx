import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { convertLbpToUsdMinor, formatMoney, type Currency } from '@/domain/money';
import { AppText, type TextTone } from '@/ui/AppText';
import { useReducedMotion } from '@/ui/layout';
import { radius, spacing, useTokens, type TypeVariant } from '@/ui/theme';

const LRI = '⁦';
const PDI = '⁩';
const MINUS = '−';

export type AmountKind = 'income' | 'expense' | 'refund' | 'transfer' | 'signed' | 'neutral';

/**
 * Formats an amount for display. USD shows a "$" prefix, LBP a "LBP" suffix. The number is wrapped
 * in a left-to-right isolate so digits and sign never reorder inside Arabic text.
 */
export function moneyText(
  amountMinor: bigint,
  currency: Currency,
  options: { sign?: 'auto' | 'plus' | 'minus' | 'none' } = {},
): string {
  const magnitude = amountMinor < 0n ? -amountMinor : amountMinor;
  const sign = options.sign ?? 'auto';
  const prefix =
    sign === 'plus' ? '+'
      : sign === 'minus' ? MINUS
        : sign === 'auto' && amountMinor < 0n ? MINUS
          : '';
  const body = formatMoney(magnitude, currency);
  const text = currency === 'USD' ? `${prefix}$${body}` : `${prefix}${body} LBP`;
  return `${LRI}${text}${PDI}`;
}

/** Compact axis/tile figures: 1.2k, 3.4M. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

function trim(value: number): string {
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
}

/**
 * LBP total → USD minor units for a display-only figure (e.g. combined net worth). The domain
 * converter validates single entries (non-zero, bounded), which aggregate totals may not satisfy,
 * so this never throws: zero converts to zero and anything else invalid returns null (hide it).
 */
export function lbpToUsdForDisplay(lbpMinor: bigint, rateE4: bigint): bigint | null {
  if (lbpMinor === 0n) return 0n;
  try {
    return convertLbpToUsdMinor(lbpMinor, rateE4);
  } catch {
    return null;
  }
}

export function minorToNumber(amountMinor: bigint, currency: Currency): number {
  return Number(amountMinor) / (currency === 'USD' ? 100 : 1);
}

export function Amount({
  minor,
  currency,
  kind = 'neutral',
  variant = 'bodyStrong',
  tone,
  style,
}: {
  minor: bigint;
  currency: Currency;
  kind?: AmountKind;
  variant?: TypeVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
}) {
  const sign =
    kind === 'income' || kind === 'refund' ? 'plus'
      : kind === 'expense' ? 'minus'
        : kind === 'signed' ? (minor > 0n ? 'plus' : 'auto')
          : kind === 'transfer' ? 'none'
            : 'auto';
  const resolvedTone: TextTone =
    tone ??
    (kind === 'income' || kind === 'refund' || (kind === 'signed' && minor > 0n) ? 'positive'
      : kind === 'transfer' ? 'secondary'
        : 'default');
  return (
    <AppText variant={variant} tone={resolvedTone} numeric numberOfLines={1} style={style}>
      {moneyText(minor, currency, { sign })}
    </AppText>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Progress                                                                                       */
/* -------------------------------------------------------------------------------------------- */

export function progressTone(ratio: number): 'primary' | 'warning' | 'negative' {
  if (ratio > 1) return 'negative';
  if (ratio >= 0.85) return 'warning';
  return 'primary';
}

export function ProgressBar({
  ratio,
  tone,
  height = 8,
  accessibilityLabel,
}: {
  ratio: number;
  tone?: 'primary' | 'warning' | 'negative' | 'positive';
  height?: number;
  accessibilityLabel?: string;
}) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const [progress] = useState(() => new Animated.Value(reduced ? clamped : 0));
  const resolved = tone ?? progressTone(ratio);
  const color =
    resolved === 'negative' ? tokens.negative
      : resolved === 'warning' ? tokens.warning
        : resolved === 'positive' ? tokens.positive
          : tokens.primary;

  useEffect(() => {
    if (reduced) {
      progress.setValue(clamped);
      return;
    }
    Animated.timing(progress, { toValue: clamped, duration: 600, useNativeDriver: false }).start();
  }, [clamped, progress, reduced]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height, backgroundColor: tokens.track }]}
    >
      <Animated.View
        style={{
          height,
          borderRadius: height,
          backgroundColor: color,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Charts                                                                                         */
/* -------------------------------------------------------------------------------------------- */

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
          <AppText variant="label" tone="secondary">
            {item.label}
          </AppText>
          {item.value ? (
            <AppText variant="label" numeric style={styles.semibold}>
              {item.value}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Part-to-whole of two quantities (e.g. income vs spending this month) as one bar with a 2px gap.
 */
export function SplitBar({
  a,
  b,
  colorA,
  colorB,
  height = 10,
}: {
  a: number;
  b: number;
  colorA: string;
  colorB: string;
  height?: number;
}) {
  const tokens = useTokens();
  const total = a + b;
  if (total <= 0) {
    return <View style={[styles.track, { height, borderRadius: height, backgroundColor: tokens.track }]} />;
  }
  return (
    <View style={[styles.split, { height }]} importantForAccessibility="no-hide-descendants">
      {a > 0 ? <View style={{ flex: a, backgroundColor: colorA, borderRadius: 4 }} /> : null}
      {b > 0 ? <View style={{ flex: b, backgroundColor: colorB, borderRadius: 4 }} /> : null}
    </View>
  );
}

export interface ColumnDatum {
  key: string;
  label: string;
  income: number;
  expense: number;
  incomeText: string;
  expenseText: string;
}

/**
 * Grouped columns (income vs spending per period) on one axis. Tap a period to inspect its exact
 * values; the latest period is selected by default. A legend is always shown.
 */
export function CashFlowColumns({
  data,
  incomeLabel,
  expenseLabel,
  height = 168,
}: {
  data: ColumnDatum[];
  incomeLabel: string;
  expenseLabel: string;
  height?: number;
}) {
  const tokens = useTokens();
  const [selected, setSelected] = useState<string | null>(null);
  const active = data.find((item) => item.key === selected) ?? data[data.length - 1];
  const max = Math.max(1, ...data.map((item) => Math.max(item.income, item.expense)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;

  return (
    <View style={styles.chart}>
      {active ? (
        <View style={[styles.readout, { backgroundColor: tokens.surfaceMuted }]}>
          <AppText variant="label" tone="secondary" style={styles.flex} numberOfLines={1}>
            {active.label}
          </AppText>
          <View style={styles.readoutValue}>
            <View style={[styles.legendSwatch, { backgroundColor: tokens.seriesIncome }]} />
            <AppText variant="label" numeric style={styles.semibold}>
              {active.incomeText}
            </AppText>
          </View>
          <View style={styles.readoutValue}>
            <View style={[styles.legendSwatch, { backgroundColor: tokens.seriesExpense }]} />
            <AppText variant="label" numeric style={styles.semibold}>
              {active.expenseText}
            </AppText>
          </View>
        </View>
      ) : null}
      <View style={[styles.plot, { height }]}>
        <View style={styles.axis}>
          {[...ticks].reverse().map((tick) => (
            <AppText key={tick} variant="caption" tone="muted" numeric style={styles.axisLabel}>
              {compactNumber(tick)}
            </AppText>
          ))}
        </View>
        <View style={styles.plotArea}>
          {ticks.map((tick) => (
            <View
              key={tick}
              style={[
                styles.gridline,
                { bottom: `${(tick / top) * 100}%`, backgroundColor: tick === 0 ? tokens.borderStrong : tokens.gridline },
              ]}
            />
          ))}
          <View style={styles.columns}>
            {data.map((item) => {
              const isActive = item.key === active?.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setSelected(item.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${item.label}: ${incomeLabel} ${item.incomeText}, ${expenseLabel} ${item.expenseText}`}
                  style={[styles.columnHit, isActive ? { backgroundColor: tokens.surfaceMuted } : null]}
                >
                  <View style={styles.columnPair}>
                    <Bar value={item.income} top={top} color={tokens.seriesIncome} dimmed={!isActive} />
                    <Bar value={item.expense} top={top} color={tokens.seriesExpense} dimmed={!isActive} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.xAxis}>
        {data.map((item) => (
          <AppText
            key={item.key}
            variant="caption"
            tone={item.key === active?.key ? 'default' : 'muted'}
            align="center"
            numberOfLines={1}
            style={styles.xLabel}
          >
            {item.label.slice(0, 3)}
          </AppText>
        ))}
      </View>
      <Legend
        items={[
          { label: incomeLabel, color: tokens.seriesIncome },
          { label: expenseLabel, color: tokens.seriesExpense },
        ]}
      />
    </View>
  );
}

function Bar({ value, top, color, dimmed }: { value: number; top: number; color: string; dimmed: boolean }) {
  const pct = top > 0 ? Math.max(0, Math.min(1, value / top)) : 0;
  return (
    <View style={styles.barSlot}>
      <View
        style={[
          styles.bar,
          { height: `${pct * 100}%`, backgroundColor: color, opacity: dimmed ? 0.55 : 1, minHeight: value > 0 ? 3 : 0 },
        ]}
      />
    </View>
  );
}

function niceTicks(max: number): number[] {
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? rough;
  return [0, step, step * 2, step * 3];
}

export interface RankedDatum {
  key: string;
  label: string;
  value: number;
  valueText: string;
  icon?: string;
}

/** Ranked horizontal bars for a breakdown: one series, one color, values and share as text. */
export function RankedBars({
  data,
  color,
  limit = 6,
  otherLabel,
}: {
  data: RankedDatum[];
  color: string;
  limit?: number;
  otherLabel: string;
}) {
  const tokens = useTokens();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const rows =
    rest.length > 0
      ? [
          ...head,
          {
            key: '__other',
            label: otherLabel,
            value: rest.reduce((sum, item) => sum + item.value, 0),
            valueText: '',
          } satisfies RankedDatum,
        ]
      : head;
  const max = Math.max(1, ...rows.map((item) => item.value));
  return (
    <View style={styles.ranked}>
      {rows.map((item) => {
        const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <View
            key={item.key}
            style={styles.rankedRow}
            accessible
            accessibilityLabel={`${item.label}: ${item.valueText || compactNumber(item.value)}, ${share}%`}
          >
            <View style={styles.rankedHeader}>
              <AppText variant="label" numberOfLines={1} style={[styles.flex, styles.semibold]}>
                {item.label}
              </AppText>
              <AppText variant="label" numeric style={styles.semibold}>
                {item.valueText || compactNumber(item.value)}
              </AppText>
              <AppText variant="caption" tone="muted" numeric style={styles.share}>
                {`${share}%`}
              </AppText>
            </View>
            <View style={[styles.track, { height: 8, borderRadius: 4, backgroundColor: tokens.track }]}>
              <View
                style={{
                  width: `${(item.value / max) * 100}%`,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: color,
                  opacity: item.key === '__other' ? 0.5 : 1,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  semibold: { fontWeight: '600' },
  track: { overflow: 'hidden', width: '100%' },
  split: { flexDirection: 'row', gap: 2, width: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  chart: { gap: spacing.md },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  readoutValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  plot: { flexDirection: 'row', gap: spacing.sm },
  axis: { justifyContent: 'space-between', paddingBottom: 0, marginBottom: -7, marginTop: -7, minWidth: 32 },
  axisLabel: { textAlign: 'right' },
  plotArea: { flex: 1, position: 'relative' },
  gridline: { position: 'absolute', start: 0, end: 0, height: 1 },
  columns: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  columnHit: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', borderRadius: radius.sm, paddingHorizontal: 2 },
  columnPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: '100%' },
  barSlot: { width: 12, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  xAxis: { flexDirection: 'row', paddingStart: 40 },
  xLabel: { flex: 1 },
  ranked: { gap: spacing.md + 2 },
  rankedRow: { gap: spacing.xs + 2 },
  rankedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  share: { minWidth: 36, textAlign: 'right' },
});
