/**
 * The ONLY documented exception to "no SQL interpolation" (ARCHITECTURE.md, D1):
 * SQLCipher's PRAGMA key / PRAGMA rekey cannot take bound parameters.
 *
 * Safety: the statement is built only from a 32-byte Uint8Array that the app
 * generated itself, encoded as hex. It never touches user input.
 */
const KEY_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function assertKey(key: Uint8Array): string {
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) {
    throw new Error(`SQLCipher key must be exactly ${KEY_BYTES} bytes`);
  }
  const hex = toHex(key);
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('SQLCipher key encoding failed');
  return hex;
}

/** Raw-key form: x'<hex>' skips SQLCipher's internal PBKDF2 (the key is already random). */
export function keyPragma(key: Uint8Array): string {
  return `PRAGMA key = "x'${assertKey(key)}'"`;
}

export function rekeyPragma(newKey: Uint8Array): string {
  return `PRAGMA rekey = "x'${assertKey(newKey)}'"`;
}
