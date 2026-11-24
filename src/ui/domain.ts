import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { formatDate } from '@/i18n/formatters';
import { normalizeLanguage, type AppLanguage } from '@/i18n/language';
import { resources } from '@/i18n/resources';
import type { Tint } from '@/ui/surfaces';

/* Icons are MaterialCommunityIcons names (rendered through react-native-paper's Icon). */

const CATEGORY_ICONS: Record<string, string> = {
  'category.income.salary': 'briefcase-outline',
  'category.income.business': 'storefront-outline',
  'category.income.gifts': 'gift-outline',
  'category.income.other': 'cash-plus',
  'category.expense.food': 'silverware-fork-knife',
  'category.expense.housing': 'home-outline',
  'category.expense.transport': 'car-outline',
  'category.expense.health': 'heart-pulse',
  'category.expense.education': 'school-outline',
  'category.expense.utilities': 'lightning-bolt-outline',
  'category.expense.shopping': 'shopping-outline',
  'category.expense.other': 'dots-horizontal-circle-outline',
};

export function categoryIcon(builtinKey: string | null | undefined, kind?: 'income' | 'expense' | null): string {
  if (builtinKey && CATEGORY_ICONS[builtinKey]) return CATEGORY_ICONS[builtinKey];
  return kind === 'income' ? 'tray-arrow-down' : 'tag-outline';
}

const ACCOUNT_ICONS: Record<string, string> = {
  cash: 'cash',
  bank: 'bank-outline',
  card: 'credit-card-outline',
  wallet: 'wallet-outline',
  savings: 'piggy-bank-outline',
  other: 'folder-outline',
};

export function accountIcon(type: string | null | undefined): string {
  return (type && ACCOUNT_ICONS[type]) || 'wallet-outline';
}

export type TransactionKind = 'income' | 'expense' | 'refund' | 'transfer';

export function kindIcon(kind: TransactionKind): string {
  switch (kind) {
    case 'income': return 'arrow-bottom-left';
    case 'refund': return 'cash-refund';
    case 'transfer': return 'swap-horizontal';
    default: return 'arrow-top-right';
  }
}

export function kindTint(kind: TransactionKind): Tint {
  switch (kind) {
    case 'income':
    case 'refund':
      return 'positive';
    case 'transfer':
      return 'info';
    default:
      return 'neutral';
  }
}

/** Resolves a category's display name: user-entered name, else the translated built-in key. */
export function categoryLabel(
  t: TFunction,
  name: string | null | undefined,
  builtinKey: string | null | undefined,
): string {
  if (name) return name;
  if (!builtinKey) return '';
  switch (builtinKey) {
    case 'category.income.salary': return t('category.income.salary');
    case 'category.income.business': return t('category.income.business');
    case 'category.income.gifts': return t('category.income.gifts');
    case 'category.income.other': return t('category.income.other');
    case 'category.expense.food': return t('category.expense.food');
    case 'category.expense.housing': return t('category.expense.housing');
    case 'category.expense.transport': return t('category.expense.transport');
    case 'category.expense.health': return t('category.expense.health');
    case 'category.expense.education': return t('category.expense.education');
    case 'category.expense.utilities': return t('category.expense.utilities');
    case 'category.expense.shopping': return t('category.expense.shopping');
    case 'category.expense.other': return t('category.expense.other');
    default: return builtinKey;
  }
}

/** Report labels come back as either a user name or a built-in key. */
export function reportCategoryLabel(t: TFunction, label: string): string {
  if (label === 'uncategorized') return t('ui.uncategorized');
  return label.startsWith('category.') ? categoryLabel(t, null, label) : label;
}

/* -------------------------------------------------------------------------------------------- */
/* Dates                                                                                          */
/* -------------------------------------------------------------------------------------------- */

export function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [yearText, monthText] = month.split('-');
  const index = Number(yearText) * 12 + (Number(monthText) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function useAppLanguage(): AppLanguage {
  const { i18n } = useTranslation();
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
}

export function useDateFormat() {
  const language = useAppLanguage();
  const months = resources[language].translation.date.months;
  return {
    language,
    /** "24 November 2026"; falls back to the raw string for invalid input. */
    date(iso: string | null | undefined): string {
      if (!iso) return '';
      try {
        return formatDate(iso.slice(0, 10), language);
      } catch {
        return iso;
      }
    },
    /** "24 Nov" style short date (Arabic keeps the full month name). */
    shortDate(iso: string | null | undefined): string {
      if (!iso) return '';
      const [, month, day] = iso.slice(0, 10).split('-');
      const name = months[Number(month) - 1];
      if (!name || !day) return iso;
      return `${Number(day)} ${language === 'en' ? name.slice(0, 3) : name}`;
    },
    /** "November 2026" from "2026-11". */
    month(yyyyMm: string): string {
      const [year, month] = yyyyMm.split('-');
      const name = months[Number(month) - 1];
      return name ? `${name} ${year}` : yyyyMm;
    },
    monthShort(yyyyMm: string): string {
      const name = months[Number(yyyyMm.split('-')[1]) - 1];
      return name ?? yyyyMm;
    },
  };
}

export function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
