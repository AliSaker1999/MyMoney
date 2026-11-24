import fc from 'fast-check';

import {
  assertValidEntryAmount,
  assertValidRate,
  calculateEntryEquivalents,
  ConversionOverflowError,
  convertLbpToUsdMinor,
  convertUsdToLbpMinor,
  createTransferLegs,
  formatMoney,
  formatRate,
  impliedRateE4,
  InvalidExchangeRateError,
  InvalidMoneyAmountError,
  MAX_ENTRY,
  MoneyParseError,
  parseMoney,
  parseRate,
  roundHalfEven,
  sumMinorAmounts,
} from '@/domain/money';

describe('money range and conversions', () => {
  it('accepts signed entry boundaries and rejects zero and amounts beyond the limit', () => {
    expect(assertValidEntryAmount(1n)).toBe(1n);
    expect(assertValidEntryAmount(-1n)).toBe(-1n);
    expect(assertValidEntryAmount(MAX_ENTRY)).toBe(MAX_ENTRY);
    expect(assertValidEntryAmount(-MAX_ENTRY)).toBe(-MAX_ENTRY);
    expect(() => assertValidEntryAmount(0n)).toThrow(InvalidMoneyAmountError);
    expect(() => assertValidEntryAmount(MAX_ENTRY + 1n)).toThrow(InvalidMoneyAmountError);
    expect(() => assertValidEntryAmount(-MAX_ENTRY - 1n)).toThrow(InvalidMoneyAmountError);
  });

  it('converts the specified exact USD/LBP pair and the 1507.5 rate', () => {
    const rate = 895_000_000n;
    expect(convertLbpToUsdMinor(895_000n, rate)).toBe(1_000n);
    expect(convertUsdToLbpMinor(1_000n, rate)).toBe(895_000n);

    const rate1507_5 = parseRate('1507.5');
    expect(rate1507_5).toBe(15_075_000n);
    expect(convertLbpToUsdMinor(1_507_500n, rate1507_5)).toBe(100_000n);
    expect(convertUsdToLbpMinor(100_000n, rate1507_5)).toBe(1_507_500n);
    expect(formatRate(rate1507_5)).toBe('1,507.5000');
  });

  it('rounds positive and negative half ties to even', () => {
    const rate = 2_000_000n;
    expect(convertLbpToUsdMinor(1n, rate)).toBe(0n);
    expect(convertLbpToUsdMinor(3n, rate)).toBe(2n);
    expect(convertLbpToUsdMinor(5n, rate)).toBe(2n);
    expect(convertLbpToUsdMinor(-1n, rate)).toBe(0n);
    expect(convertLbpToUsdMinor(-3n, rate)).toBe(-2n);
    expect(convertLbpToUsdMinor(2n, rate)).toBe(1n);
    expect(convertLbpToUsdMinor(4n, rate)).toBe(2n);
    expect(roundHalfEven(4n, 10n)).toBe(0n);
    expect(roundHalfEven(6n, 10n)).toBe(1n);
    expect(roundHalfEven(-4n, 10n)).toBe(0n);
    expect(roundHalfEven(-6n, 10n)).toBe(-1n);
  });

  it('supports tiny conversions and surfaces conversion overflow', () => {
    expect(convertLbpToUsdMinor(1n, 895_000_000n)).toBe(0n);
    expect(assertValidRate(1n)).toBe(1n);
    expect(assertValidRate(1_000_000_000_000n)).toBe(1_000_000_000_000n);
    expect(convertLbpToUsdMinor(1n, 1n)).toBe(1_000_000n);
    expect(convertLbpToUsdMinor(1_000_000n, 1_000_000_000_000n)).toBe(1n);
    expect(() => convertLbpToUsdMinor(MAX_ENTRY, 10_000n)).toThrow(ConversionOverflowError);
    expect(() => convertLbpToUsdMinor(1n, 0n)).toThrow(InvalidExchangeRateError);
    expect(() => convertLbpToUsdMinor(1n, 1_000_000_000_001n)).toThrow(
      InvalidExchangeRateError,
    );
  });

  it('calculates native equivalents and an implied rate without floating-point values', () => {
    expect(calculateEntryEquivalents(1_000n, 'USD', 895_000_000n)).toEqual({
      usdMinor: 1_000n,
      lbpMinor: 895_000n,
    });
    expect(impliedRateE4(895_000n, 1_000n)).toBe(895_000_000n);
    expect(() => impliedRateE4(895_000n, -1_000n)).toThrow(InvalidMoneyAmountError);
  });
});

describe('money parsing and formatting', () => {
  it('parses Western and Arabic-Indic digits and separators exactly', () => {
    expect(parseMoney('1,234.56', 'USD')).toBe(123_456n);
    expect(parseMoney('١٬٢٣٤٫٥٦', 'USD')).toBe(123_456n);
    expect(parseMoney('۱۲۳۴', 'LBP')).toBe(1_234n);
    expect(parseMoney('-١٫٢٥', 'USD')).toBe(-125n);
  });

  it.each([
    ['0.005', 'USD'],
    ['1.5', 'LBP'],
    ['1e3', 'USD'],
    ['--1', 'USD'],
    ['', 'USD'],
    ['1,23.45', 'USD'],
    ['1.234,56', 'USD'],
  ] as const)('rejects invalid amount %s (%s)', (input, currency) => {
    expect(() => parseMoney(input, currency)).toThrow(MoneyParseError);
  });

  it('rejects zero as a ledger entry', () => {
    expect(() => parseMoney('0', 'USD')).toThrow(InvalidMoneyAmountError);
  });

  it('rejects rate precision beyond four decimals and invalid rates', () => {
    expect(parseRate('1507.1234')).toBe(15_071_234n);
    expect(() => parseRate('1507.12345')).toThrow(MoneyParseError);
    expect(() => parseRate('0')).toThrow(InvalidExchangeRateError);
    expect(() => parseRate('-1')).toThrow(InvalidExchangeRateError);
  });

  it('round-trips signed values through exact formatted strings', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -MAX_ENTRY, max: MAX_ENTRY }).filter((amount) => amount !== 0n),
        (amount) => parseMoney(formatMoney(amount, 'USD'), 'USD') === amount,
      ),
    );
    expect(parseMoney(formatMoney(-123_456n, 'LBP'), 'LBP')).toBe(-123_456n);
    expect(formatMoney(123_456n, 'USD', 'arabic')).toBe('١,٢٣٤.٥٦');
    expect(formatMoney(123_456n, 'USD', 'persian')).toBe('۱,۲۳۴.۵۶');
  });
});

describe('exact aggregates and transfers', () => {
  it('sums amounts exactly beyond Number safe integer precision', () => {
    const amounts = [MAX_ENTRY, MAX_ENTRY, -MAX_ENTRY, 123n];
    expect(sumMinorAmounts(amounts)).toBe(MAX_ENTRY + 123n);
  });

  it('keeps same- and cross-currency transfer equivalents balanced', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('USD' as const, 'LBP' as const),
        fc.constantFrom('USD' as const, 'LBP' as const),
        fc.bigInt({ min: 1_000_000n, max: 100_000_000n }),
        (sourceCurrency, destinationCurrency, amount) => {
          const transfer = createTransferLegs(
            sourceCurrency,
            destinationCurrency,
            amount,
            15_075_000n,
          );
          return (
            transfer.source.amountMinor < 0n &&
            transfer.destination.amountMinor > 0n &&
            transfer.source.usdMinor + transfer.destination.usdMinor === 0n &&
            transfer.source.lbpMinor + transfer.destination.lbpMinor === 0n
          );
        },
      ),
    );
  });

  it('round-trips USD through LBP within one minor unit', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -1_000_000n, max: 1_000_000n }).filter((amount) => amount !== 0n),
        (usdMinor) => {
          const lbpMinor = convertUsdToLbpMinor(usdMinor, 15_075_000n);
          const returned = convertLbpToUsdMinor(lbpMinor, 15_075_000n);
          const difference = returned - usdMinor;
          return difference >= -1n && difference <= 1n;
        },
      ),
    );
  });
});
