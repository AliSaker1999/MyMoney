import { scrypt } from '@noble/hashes/scrypt.js';
import { scryptSync, webcrypto } from 'node:crypto';

import { AES_VECTOR, bytesToHex, hexToBytes, SCRYPT_VECTOR } from '@/spike/fixtures';

// The device spike checks expo-crypto AES-GCM and @noble/hashes on Hermes against these same vectors.
describe('AES-256-GCM vector (Node WebCrypto)', () => {
  const subtle = webcrypto.subtle;
  const iv = hexToBytes(AES_VECTOR.ivHex);
  const aad = new TextEncoder().encode(AES_VECTOR.aadUtf8);
  const pt = Buffer.from(AES_VECTOR.plaintextB64, 'base64');
  const keyP = subtle.importKey('raw', hexToBytes(AES_VECTOR.keyHex), 'AES-GCM', false, ['encrypt', 'decrypt']);

  it('encrypts to the fixed ciphertext+tag', async () => {
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await keyP, pt);
    expect(bytesToHex(new Uint8Array(ct))).toBe(AES_VECTOR.ciphertextWithTagHex);
  });

  it('rejects a flipped ciphertext bit and a wrong AAD', async () => {
    const key = await keyP;
    const bad = hexToBytes(AES_VECTOR.ciphertextWithTagHex);
    bad[3] = (bad[3] ?? 0) ^ 1;
    await expect(subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, bad)).rejects.toThrow();
    await expect(
      subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('other-aad') },
        key,
        hexToBytes(AES_VECTOR.ciphertextWithTagHex),
      ),
    ).rejects.toThrow();
  });
});

describe('scrypt vector (@noble/hashes vs node:crypto)', () => {
  const pw = new TextEncoder().encode(SCRYPT_VECTOR.password);
  const salt = new TextEncoder().encode(SCRYPT_VECTOR.salt);

  it.each([1024, 32768])('N=%i matches node:crypto and the fixed vector', (N) => {
    const opts = { N, r: SCRYPT_VECTOR.r, p: SCRYPT_VECTOR.p, dkLen: SCRYPT_VECTOR.dkLen };
    const noble = bytesToHex(scrypt(pw, salt, opts));
    const node = scryptSync(pw, salt, 32, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');
    expect(noble).toBe(node);
    expect(noble).toBe(SCRYPT_VECTOR.expected[N]);
  });
});
