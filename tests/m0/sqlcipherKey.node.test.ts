import { keyPragma, rekeyPragma } from '@/db/sqlcipherKey';

describe('PRAGMA key builder (the one documented SQL-interpolation exception)', () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);

  it('builds the raw-key form from exactly 32 bytes', () => {
    expect(keyPragma(key)).toBe(
      `PRAGMA key = "x'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'"`,
    );
    expect(rekeyPragma(key)).toMatch(/^PRAGMA rekey = "x'[0-9a-f]{64}'"$/);
  });

  it.each([0, 16, 31, 33, 64])('rejects a %i-byte key', (n) => {
    expect(() => keyPragma(new Uint8Array(n))).toThrow(/exactly 32 bytes/);
  });

  it('rejects non-Uint8Array input', () => {
    expect(() => keyPragma("'; DROP TABLE x; --" as unknown as Uint8Array)).toThrow();
  });
});
