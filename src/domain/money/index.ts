export type Currency = 'USD' | 'LBP';
export type DigitStyle = 'western' | 'arabic' | 'persian';

export const MAX_ENTRY = 100_000_000_000_000n;
export const MIN_RATE_E4 = 1n;
export const MAX_RATE_E4 = 1_000_000_000_000n;
const RATE_SCALE = 1_000_000n;
const RATE_DISPLAY_SCALE = 10_000n;

export class InvalidMoneyAmountError extends RangeError {
  constructor(message = 'Money amount must be non-zero and within the supported range.') {
    super(message);
    this.name = 'InvalidMoneyAmountError';
  }
}

export class ConversionOverflowError extends RangeError {
  constructor() {
    super('Converted amount is outside the supported range.');
    this.name = 'ConversionOverflowError';
  }
}

export class InvalidExchangeRateError extends RangeError {
  constructor() {
    super('Exchange rate must be within the supported range.');
    this.name = 'InvalidExchangeRateError';
  }
}

export class MoneyParseError extends TypeError {
  constructor() {
    super('Amount is not in a supported numeric format.');
    this.name = 'MoneyParseError';
  }
}

export function assertValidEntryAmount(amountMinor: bigint): bigint {
  if (amountMinor === 0n || amountMinor < -MAX_ENTRY || amountMinor > MAX_ENTRY) {
    throw new InvalidMoneyAmountError();
  }
  return amountMinor;
}

export function assertValidRate(rateE4: bigint): bigint {
  if (rateE4 < MIN_RATE_E4 || rateE4 > MAX_RATE_E4) {
    throw new InvalidExchangeRateError();
  }
  return rateE4;
}

export function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('Rounding denominator must be positive.');
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubledRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  if (doubledRemainder < denominator) return quotient;

  const step = numerator < 0n ? -1n : 1n;
  if (doubledRemainder > denominator || quotient % 2n !== 0n) {
    return quotient + step;
  }
  return quotient;
}

export function convertLbpToUsdMinor(lbpMinor: bigint, rateE4: bigint): bigint {
  assertValidEntryAmount(lbpMinor);
  assertValidRate(rateE4);
  return assertConversionRange(roundHalfEven(lbpMinor * RATE_SCALE, rateE4));
}

export function convertUsdToLbpMinor(usdMinor: bigint, rateE4: bigint): bigint {
  assertValidEntryAmount(usdMinor);
  assertValidRate(rateE4);
  return assertConversionRange(roundHalfEven(usdMinor * rateE4, RATE_SCALE));
}

export function impliedRateE4(lbpMinor: bigint, usdMinor: bigint): bigint {
  assertValidEntryAmount(lbpMinor);
  assertValidEntryAmount(usdMinor);
  if ((lbpMinor < 0n) !== (usdMinor < 0n)) {
    throw new InvalidMoneyAmountError('Implied rate requires amounts with matching signs.');
  }
  return assertValidRate(
    roundHalfEven(abs(lbpMinor) * RATE_SCALE, abs(usdMinor)),
  );
}

export interface EntryEquivalents {
  usdMinor: bigint;
  lbpMinor: bigint;
}

export function calculateEntryEquivalents(
  amountMinor: bigint,
  currency: Currency,
  rateE4: bigint,
): EntryEquivalents {
  assertValidEntryAmount(amountMinor);
  assertValidRate(rateE4);
  return currency === 'USD'
    ? { usdMinor: amountMinor, lbpMinor: convertUsdToLbpMinor(amountMinor, rateE4) }
    : { usdMinor: convertLbpToUsdMinor(amountMinor, rateE4), lbpMinor: amountMinor };
}

export interface TransferLeg extends EntryEquivalents {
  currency: Currency;
  amountMinor: bigint;
}

export function createTransferLegs(
  sourceCurrency: Currency,
  destinationCurrency: Currency,
  sourceAmountMinor: bigint,
  rateE4: bigint,
): { source: TransferLeg; destination: TransferLeg } {
  assertValidEntryAmount(sourceAmountMinor);
  if (sourceAmountMinor < 0n) {
    throw new InvalidMoneyAmountError('Transfer amount must be entered as a positive amount.');
  }
  assertValidRate(rateE4);

  const sourceEquivalents = calculateEntryEquivalents(sourceAmountMinor, sourceCurrency, rateE4);
  const destinationAmountMinor =
    sourceCurrency === destinationCurrency
      ? sourceAmountMinor
      : sourceCurrency === 'USD'
        ? sourceEquivalents.lbpMinor
        : sourceEquivalents.usdMinor;
  assertValidEntryAmount(destinationAmountMinor);

  return {
    source: {
      currency: sourceCurrency,
      amountMinor: -sourceAmountMinor,
      usdMinor: -sourceEquivalents.usdMinor,
      lbpMinor: -sourceEquivalents.lbpMinor,
    },
    destination: {
      currency: destinationCurrency,
      amountMinor: destinationAmountMinor,
      usdMinor: sourceEquivalents.usdMinor,
      lbpMinor: sourceEquivalents.lbpMinor,
    },
  };
}

export function sumMinorAmounts(amounts: readonly bigint[]): bigint {
  return amounts.reduce((total, amount) => total + amount, 0n);
}

export function parseMoney(input: string, currency: Currency): bigint {
  const decimals = currency === 'USD' ? 2 : 0;
  const parsed = parseDecimal(input, decimals);
  const scale = currency === 'USD' ? 100n : 1n;
  const magnitude =
    parsed.whole * scale + parsed.fraction * (scale / powerOfTen(parsed.fractionDigits));
  return assertValidEntryAmount(parsed.negative ? -magnitude : magnitude);
}

export function parseRate(input: string): bigint {
  const parsed = parseDecimal(input, 4);
  if (parsed.negative) throw new InvalidExchangeRateError();
  const fraction = parsed.fraction * powerOfTen(4 - parsed.fractionDigits);
  return assertValidRate(parsed.whole * RATE_DISPLAY_SCALE + fraction);
}

export function formatMoney(
  amountMinor: bigint,
  currency: Currency,
  digitStyle: DigitStyle = 'western',
): string {
  const decimals = currency === 'USD' ? 2 : 0;
  const scale = currency === 'USD' ? 100n : 1n;
  const magnitude = abs(amountMinor);
  const whole = (magnitude / scale).toString();
  const grouped = groupThousands(whole);
  const fraction = decimals === 0 ? '' : `.${(magnitude % scale).toString().padStart(decimals, '0')}`;
  const sign = amountMinor < 0n ? '-' : '';
  return localizeDigits(`${sign}${grouped}${fraction}`, digitStyle);
}

export function formatRate(rateE4: bigint, digitStyle: DigitStyle = 'western'): string {
  assertValidRate(rateE4);
  const whole = (rateE4 / RATE_DISPLAY_SCALE).toString();
  const fraction = (rateE4 % RATE_DISPLAY_SCALE).toString().padStart(4, '0');
  return localizeDigits(`${groupThousands(whole)}.${fraction}`, digitStyle);
}

function assertConversionRange(amount: bigint): bigint {
  if (amount < -MAX_ENTRY || amount > MAX_ENTRY) throw new ConversionOverflowError();
  return amount;
}

function parseDecimal(input: string, maxFractionDigits: number): {
  whole: bigint;
  fraction: bigint;
  fractionDigits: number;
  negative: boolean;
} {
  const value = input.trim();
  const sign = value[0] === '-' || value[0] === '+' ? value[0] : '';
  const unsigned = sign ? value.slice(1) : value;
  if (!unsigned) throw new MoneyParseError();

  const decimalMarks = [...unsigned].filter((char) => char === '.' || char === '\u066b');
  if (decimalMarks.length > 1 || (decimalMarks.length === 1 && unsigned.includes('.') && unsigned.includes('\u066b'))) {
    throw new MoneyParseError();
  }
  const decimalMark = decimalMarks[0];
  const parts = decimalMark ? unsigned.split(decimalMark) : [unsigned];
  if (parts.length > 2 || !parts[0] || (decimalMark && !parts[1])) throw new MoneyParseError();

  const integerText = parts[0] ?? '';
  const fractionText = parts[1] ?? '';
  const normalizedInteger = normalizeDigits(integerText);
  const normalizedFraction = normalizeDigits(fractionText);
  if (normalizedFraction.length > maxFractionDigits || (maxFractionDigits === 0 && decimalMark)) {
    throw new MoneyParseError();
  }

  const groupedInteger = normalizeGroupedInteger(normalizedInteger);
  if (!/^\d+$/.test(groupedInteger) || (normalizedFraction && !/^\d+$/.test(normalizedFraction))) {
    throw new MoneyParseError();
  }

  return {
    whole: BigInt(groupedInteger),
    fraction: normalizedFraction ? BigInt(normalizedFraction) : 0n,
    fractionDigits: normalizedFraction.length,
    negative: sign === '-',
  };
}

function normalizeGroupedInteger(value: string): string {
  const groupMarks = [...value].filter((char) => char === ',' || char === '\u066c');
  if (groupMarks.length === 0) return value;
  if (value.includes(',') && value.includes('\u066c')) throw new MoneyParseError();

  const separator = groupMarks[0];
  if (!separator) throw new MoneyParseError();
  const groups = value.split(separator);
  if (
    groups.length < 2 ||
    (groups[0] ?? '').length < 1 ||
    (groups[0] ?? '').length > 3 ||
    !/^\d+$/.test(groups[0] ?? '') ||
    groups.slice(1).some((group) => group.length !== 3 || !/^\d{3}$/.test(group))
  ) {
    throw new MoneyParseError();
  }
  return groups.join('');
}

function normalizeDigits(value: string): string {
  let normalized = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) throw new MoneyParseError();
    if (code >= 0x30 && code <= 0x39) normalized += char;
    else if (code >= 0x660 && code <= 0x669) normalized += String.fromCharCode(0x30 + code - 0x660);
    else if (code >= 0x6f0 && code <= 0x6f9) normalized += String.fromCharCode(0x30 + code - 0x6f0);
    else if (char === ',' || char === '.' || char === '\u066b' || char === '\u066c') normalized += char;
    else throw new MoneyParseError();
  }
  return normalized;
}

export function localizeDigits(value: string, style: DigitStyle): string {
  if (style === 'western') return value;
  const zeroCode = style === 'arabic' ? 0x660 : 0x6f0;
  return [...value]
    .map((char) => {
      const code = char.codePointAt(0);
      return code !== undefined && code >= 0x30 && code <= 0x39
        ? String.fromCharCode(zeroCode + code - 0x30)
        : char;
    })
    .join('');
}

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
