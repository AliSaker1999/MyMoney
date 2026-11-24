import { MD3DarkTheme, MD3LightTheme, useTheme, type MD3Theme } from 'react-native-paper';

/**
 * My Money design tokens.
 *
 * Direction: "calm ledger". Warm neutral surfaces, one evergreen accent, hairline borders instead
 * of heavy shadows, tabular figures for every amount. Expenses stay in ink; income is green; red is
 * reserved for problems (over budget, overdue, errors) so it keeps its meaning.
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  hero: string;
  heroText: string;
  heroTextMuted: string;
  heroChip: string;
  positive: string;
  positiveSoft: string;
  negative: string;
  negativeSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  track: string;
  /** Chart series, validated for CVD and contrast against `surface` (dataviz validator). */
  seriesIncome: string;
  seriesExpense: string;
  gridline: string;
  scrim: string;
}

const light: ColorTokens = {
  bg: '#F5F6F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2EF',
  surfaceSunken: '#E9ECE8',
  border: '#E3E7E2',
  borderStrong: '#CDD4CE',
  text: '#111814',
  textSecondary: '#535F58',
  textMuted: '#78847D',
  primary: '#0B6E58',
  primaryPressed: '#085A48',
  onPrimary: '#FFFFFF',
  primarySoft: '#E1F1EB',
  onPrimarySoft: '#0A5444',
  hero: '#0C3B31',
  heroText: '#F2FAF6',
  heroTextMuted: '#A8CBBE',
  heroChip: 'rgba(255,255,255,0.10)',
  positive: '#12795A',
  positiveSoft: '#E3F3EC',
  negative: '#B42318',
  negativeSoft: '#FDEDEB',
  warning: '#A15C07',
  warningSoft: '#FDF1E1',
  info: '#2559A8',
  infoSoft: '#E8F0FB',
  track: '#E8EBE7',
  seriesIncome: '#0F8A6C',
  seriesExpense: '#E0752D',
  gridline: '#ECEEEB',
  scrim: 'rgba(10,15,13,0.45)',
};

const dark: ColorTokens = {
  bg: '#0D1110',
  surface: '#161B19',
  surfaceMuted: '#1C2220',
  surfaceSunken: '#111614',
  border: '#252D2A',
  borderStrong: '#34403B',
  text: '#E8EEEA',
  textSecondary: '#A2AEA7',
  textMuted: '#79857F',
  primary: '#45C9A1',
  primaryPressed: '#38AF8B',
  onPrimary: '#04261C',
  primarySoft: '#16332A',
  onPrimarySoft: '#8FE3C8',
  hero: '#123A30',
  heroText: '#EFFAF5',
  heroTextMuted: '#9CC4B5',
  heroChip: 'rgba(255,255,255,0.08)',
  positive: '#4FD2A6',
  positiveSoft: '#14302A',
  negative: '#F97066',
  negativeSoft: '#3B1A17',
  warning: '#F5B465',
  warningSoft: '#3A2A14',
  info: '#84ADF0',
  infoSoft: '#18253A',
  track: '#232B28',
  seriesIncome: '#1AA57F',
  seriesExpense: '#D96B28',
  gridline: '#202825',
  scrim: 'rgba(0,0,0,0.6)',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** System sans throughout; tabular figures are applied by `Amount` and numeric text. */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.7 },
} as const;

export type TypeVariant = keyof typeof type;

/** Content never stretches past this width, so tablets and landscape get a centered column. */
export const layout = {
  maxContentWidth: 720,
  wideBreakpoint: 840,
  wideMaxContentWidth: 1120,
} as const;

export type AppTheme = MD3Theme & { tokens: ColorTokens; isDark: boolean };

function buildPaperTheme(base: MD3Theme, tokens: ColorTokens, isDark: boolean): AppTheme {
  return {
    ...base,
    roundness: 3,
    isDark,
    tokens,
    colors: {
      ...base.colors,
      primary: tokens.primary,
      onPrimary: tokens.onPrimary,
      primaryContainer: tokens.primarySoft,
      onPrimaryContainer: tokens.onPrimarySoft,
      secondary: tokens.textSecondary,
      onSecondary: tokens.surface,
      secondaryContainer: tokens.primarySoft,
      onSecondaryContainer: tokens.onPrimarySoft,
      tertiary: tokens.info,
      tertiaryContainer: tokens.infoSoft,
      background: tokens.bg,
      onBackground: tokens.text,
      surface: tokens.surface,
      onSurface: tokens.text,
      surfaceVariant: tokens.surfaceMuted,
      onSurfaceVariant: tokens.textSecondary,
      outline: tokens.borderStrong,
      outlineVariant: tokens.border,
      error: tokens.negative,
      onError: isDark ? '#2B0B08' : '#FFFFFF',
      errorContainer: tokens.negativeSoft,
      onErrorContainer: tokens.negative,
      backdrop: tokens.scrim,
      elevation: {
        level0: 'transparent',
        level1: tokens.surface,
        level2: tokens.surface,
        level3: tokens.surface,
        level4: tokens.surface,
        level5: tokens.surface,
      },
    },
  };
}

export const lightTheme = buildPaperTheme(MD3LightTheme, light, false);
export const darkTheme = buildPaperTheme(MD3DarkTheme, dark, true);

export function useAppTheme(): AppTheme {
  return useTheme<AppTheme>();
}

export function useTokens(): ColorTokens {
  return useAppTheme().tokens;
}

/** Hairline card shadow: barely there in light mode, absent in dark mode (borders do the work). */
export function cardShadow(isDark: boolean) {
  if (isDark) return {};
  return {
    shadowColor: '#0B1F18',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  } as const;
}
