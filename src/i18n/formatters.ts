import {
  formatMoney,
  localizeDigits,
  type Currency,
  type DigitStyle,
} from '@/domain/money';
import type { AppLanguage } from '@/i18n/language';
import { resources } from '@/i18n/resources';

const FIRST_ISOLATE = '\u2068';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

export class InvalidDateError extends RangeError {
  constructor() {
    super('Date must be a real Gregorian date in YYYY-MM-DD format.');
    this.name = 'InvalidDateError';
  }
}

export function formatLocalizedMoney(
  amountMinor: bigint,
  currency: Currency,
  language: AppLanguage,
  digitStyle: DigitStyle = 'western',
): string {
  const value = formatMoney(amountMinor, currency, digitStyle);
  const label = resources[language].translation.currency[currency];
  return `${FIRST_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE} ${label}`;
}

export function formatDate(
  isoDate: string,
  language: AppLanguage,
  digitStyle: DigitStyle = 'western',
): string {
  const date = parseIsoDate(isoDate);
  const month = resources[language].translation.date.months[date.month - 1];
  if (!month) throw new InvalidDateError();

  const day = localizeDigits(String(date.day), digitStyle);
  const year = localizeDigits(String(date.year).padStart(4, '0'), digitStyle);
  return `${day} ${month} ${year}`;
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new InvalidDateError();

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  if (!yearText || !monthText || !dayText) throw new InvalidDateError();

  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysInMonth = monthDays[month - 1];

  if (year < 1 || !daysInMonth || day < 1 || day > daysInMonth) {
    throw new InvalidDateError();
  }
  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
