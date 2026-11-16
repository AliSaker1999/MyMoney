/**
 * Fixed vectors shared by the Node tests (tests/m0) and the on-device spike,
 * so both runtimes are checked against the same expected values.
 * The vectors were produced with Node's WebCrypto and crypto.scryptSync.
 * They are technical test vectors, not financial data.
 */

/** Amendment 4: CHECK (date(col) IS col) must accept real dates only. */
export const DATE_MATRIX: readonly { value: string; accept: boolean; why: string }[] = [
  { value: '2026-11-16', accept: true, why: 'ordinary date' },
  { value: '2024-02-29', accept: true, why: 'leap day' },
  { value: '2026-02-29', accept: false, why: 'not a leap year' },
  { value: '2026-02-30', accept: false, why: 'day overflow (SQLite normalises, so IS fails)' },
  { value: '2026-04-31', accept: false, why: '30-day month' },
  { value: '2026-13-01', accept: false, why: 'month 13' },
  { value: '2026-00-10', accept: false, why: 'month 0' },
  { value: '2026-01-00', accept: false, why: 'day 0' },
  { value: '2026-1-05', accept: false, why: 'unpadded month' },
  { value: '2026-01-05 ', accept: false, why: 'trailing space' },
  { value: '2026-01-05T00:00', accept: false, why: 'has time part' },
  { value: '2026-01-05 00:00:00', accept: false, why: 'datetime string' },
  { value: '20260105', accept: false, why: 'compact form' },
  { value: '', accept: false, why: 'empty' },
  { value: 'now', accept: false, why: 'date() keyword' },
  { value: '2460995.5', accept: false, why: 'Julian day number' },
  { value: '1999-12-31', accept: true, why: 'past century' },
  { value: '2100-02-28', accept: true, why: '2100 is not a leap year; the 28th is valid' },
  { value: '2100-02-29', accept: false, why: '2100 is not a leap year' },
];

export const AES_VECTOR = {
  keyHex: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  ivHex: '000102030405060708090a0b',
  aadUtf8: 'mymoney-m0-aad',
  plaintextB64: 'TXkgTW9uZXkgTTAgQUVTLUdDTSB2ZWN0b3Ig2YXYp9mE2Yo=',
  ciphertextWithTagHex:
    '0a7bf656aa8ba762ad0ca7abf0ac2b40c495ca14861e3c085715c55c98b1a76b85c9242535a547b6182481c0d9ed725afe9f0f',
} as const;

export const SCRYPT_VECTOR = {
  password: 'correct horse battery staple',
  salt: 'mymoney-m0-salt!',
  r: 8,
  p: 1,
  dkLen: 32,
  expected: {
    1024: 'afdffffd96d584af9b0147741f9df4f31150f6804d26e548feb86e1910c9848b',
    32768: '3128e349089b99587747124d35c9e410cc1a19fffb4dc35cda1fd8dfa65e80c4',
    65536: 'be61f38c69eb2be9011e941b20b1f72cbc751c50d080371fc2b94f3f025b1417',
    131072: 'ec86b4574c2395e3f7f665abe5d6198d7f85080fa40b9c5a3ba2c1eab4ec3dcb',
  } as Record<number, string>,
} as const;

/** CLDR plural categories for Arabic. Hermes must produce these for i18next. */
export const AR_PLURALS: readonly [number, string][] = [
  [0, 'zero'],
  [1, 'one'],
  [2, 'two'],
  [3, 'few'],
  [10, 'few'],
  [11, 'many'],
  [99, 'many'],
  [100, 'other'],
  [102, 'other'],
];

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
