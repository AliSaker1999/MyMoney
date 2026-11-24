import { createInstance } from 'i18next';

import {
  formatDate,
  formatLocalizedMoney,
  InvalidDateError,
} from '@/i18n/formatters';
import { isRightToLeft, normalizeLanguage } from '@/i18n/language';
import { resources } from '@/i18n/resources';

describe('English and Arabic translations', () => {
  it('keeps translation keys and interpolation placeholders in parity', () => {
    expect(translationEntries(resources.en.translation)).toEqual(
      translationEntries(resources.ar.translation),
    );
  });

  it('normalizes supported language codes and direction', () => {
    expect(normalizeLanguage('ar-LB')).toBe('ar');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('fr-FR')).toBe('en');
    expect(isRightToLeft('ar')).toBe(true);
    expect(isRightToLeft('en')).toBe(false);
  });

  it('interpolates matching placeholders in both languages', async () => {
    const instance = createInstance();
    await instance.init({
      initAsync: false,
      resources,
      lng: 'en',
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });

    expect(instance.t('app.welcome', { name: 'Maya' })).toBe('Welcome, Maya');
    await instance.changeLanguage('ar');
    expect(instance.t('app.welcome', { name: 'مايا' })).toBe('مرحباً، مايا');
  });
});

describe('localized, deterministic formatters', () => {
  it.each([
    ['USD', 123_456n, 'western', '1,234.56'],
    ['USD', -123_456n, 'western', '-1,234.56'],
    ['USD', 123_456n, 'arabic', '١,٢٣٤.٥٦'],
    ['USD', -123_456n, 'arabic', '-١,٢٣٤.٥٦'],
    ['USD', 123_456n, 'persian', '۱,۲۳۴.۵۶'],
    ['USD', -123_456n, 'persian', '-۱,۲۳۴.۵۶'],
    ['LBP', 123_456n, 'western', '123,456'],
    ['LBP', -123_456n, 'western', '-123,456'],
    ['LBP', 123_456n, 'arabic', '١٢٣,٤٥٦'],
    ['LBP', -123_456n, 'arabic', '-١٢٣,٤٥٦'],
    ['LBP', 123_456n, 'persian', '۱۲۳,۴۵۶'],
    ['LBP', -123_456n, 'persian', '-۱۲۳,۴۵۶'],
  ] as const)('formats %s %s in %s digits', (currency, amount, digitStyle, expected) => {
    const label = resources.ar.translation.currency[currency];
    expect(formatLocalizedMoney(amount, currency, 'ar', digitStyle)).toBe(
      `\u2068${expected}\u2069 ${label}`,
    );
  });

  it('formats Gregorian dates using localized month names and selected digits', () => {
    expect(formatDate('2026-11-18', 'en')).toBe('18 November 2026');
    expect(formatDate('2026-11-18', 'ar')).toBe('18 تشرين الثاني 2026');
    expect(formatDate('2026-11-18', 'ar', 'arabic')).toBe('١٨ تشرين الثاني ٢٠٢٦');
    expect(formatDate('2024-02-29', 'en')).toBe('29 February 2024');
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-05', '2026-00-01'])(
    'rejects invalid date %s',
    (date) => {
      expect(() => formatDate(date, 'en')).toThrow(InvalidDateError);
    },
  );
});

function translationEntries(
  value: object,
  parent = '',
): Array<[string, string[]]> {
  const entries: Array<[string, string[]]> = [];
  for (const [key, child] of Object.entries(value)) {
    const path = parent ? `${parent}.${key}` : key;
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        const placeholders = typeof item === 'string' ? extractPlaceholders(item) : [];
        entries.push([`${path}.${index}`, placeholders]);
      });
    } else if (typeof child === 'object' && child !== null) {
      entries.push(...translationEntries(child, path));
    } else if (typeof child === 'string') {
      entries.push([path, extractPlaceholders(child)]);
    }
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function extractPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((match) => match[1] ?? '')
    .sort();
}

