/**
 * M0 compatibility spike: runs on the device and checks each risky dependency against
 * the fixed vectors in ./fixtures. Results are shown on screen, written to
 * <documents>/m0-spike-results.json, and logged with the [M0-SPIKE] prefix.
 *
 * Only for the M0 spike route. Not used by the app itself.
 */
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { I18nManager, Platform } from 'react-native';

import { spikeSql } from '@/db/sql/spike.sql';
import { keyPragma, rekeyPragma } from '@/db/sqlcipherKey';

import {
  AES_VECTOR,
  AR_PLURALS,
  bytesToHex,
  DATE_MATRIX,
  hexToBytes,
  SCRYPT_VECTOR,
} from './fixtures';

export type SpikeStatus = 'pass' | 'fail' | 'info';
export interface SpikeResult {
  id: string;
  status: SpikeStatus;
  detail: string;
}

type Report = (r: SpikeResult) => void;

const SQLITE_PLAINTEXT_HEADER = 'SQLite format 3\u0000';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function expectThrows(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return errMsg(e);
  }
}

function dbFile(name: string): File {
  const dir = SQLite.defaultDatabaseDirectory as string;
  const uri = dir.startsWith('file:') ? dir : `file://${dir}`;
  return new File(uri, name);
}

async function openKeyed(name: string, key: Uint8Array): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
  await db.execAsync(keyPragma(key));
  return db;
}

// ── SQLCipher + date CHECK ────────────────────────────────────────────────
async function checkSqlCipher(report: Report): Promise<void> {
  const name = `m0-spike-${Date.now()}.db`;
  const key = await Crypto.getRandomBytesAsync(32);
  const wrongKey = await Crypto.getRandomBytesAsync(32);
  const newKey = await Crypto.getRandomBytesAsync(32);

  let db = await openKeyed(name, key);
  try {
    const cv = await db.getFirstAsync<{ cipher_version: string }>(spikeSql.cipherVersion);
    const sv = await db.getFirstAsync<{ v: string }>(spikeSql.sqliteVersion);
    report({
      id: 'sqlcipher.version',
      status: cv?.cipher_version ? 'pass' : 'fail',
      detail: `cipher_version=${cv?.cipher_version ?? 'NONE (SQLCipher not linked)'}; sqlite_version=${sv?.v}`,
    });

    await db.execAsync(spikeSql.createDateProbe);
    const mismatches: string[] = [];
    for (const row of DATE_MATRIX) {
      const err = await expectThrows(() => db.runAsync(spikeSql.insertDateProbe, [row.value]));
      const accepted = err === null;
      if (accepted !== row.accept) mismatches.push(`${JSON.stringify(row.value)} accepted=${accepted}`);
    }
    report({
      id: 'sqlite.dateCheck',
      status: mismatches.length === 0 ? 'pass' : 'fail',
      detail:
        mismatches.length === 0
          ? `all ${DATE_MATRIX.length} cases match the Node/better-sqlite3 expectations`
          : `mismatches: ${mismatches.join('; ')}`,
    });
  } finally {
    await db.closeAsync();
  }

  // File on disk must not have the plaintext SQLite header.
  const head = dbFile(name).bytesSync().slice(0, 16);
  const headStr = String.fromCharCode(...head);
  report({
    id: 'sqlcipher.encryptedOnDisk',
    status: headStr !== SQLITE_PLAINTEXT_HEADER ? 'pass' : 'fail',
    detail: `first 16 bytes: ${bytesToHex(head)}`,
  });

  // Wrong key must fail.
  db = await openKeyed(name, wrongKey);
  const wrongErr = await expectThrows(() => db.getFirstAsync(spikeSql.schemaObjectCount));
  await db.closeAsync();
  report({
    id: 'sqlcipher.wrongKeyRejected',
    status: wrongErr ? 'pass' : 'fail',
    detail: wrongErr ? `error: ${wrongErr}` : 'wrong key was ACCEPTED',
  });

  // Right key reopens; rekey works; old key then fails.
  db = await openKeyed(name, key);
  const n = await db.getFirstAsync<{ n: number }>(spikeSql.schemaObjectCount);
  await db.execAsync(rekeyPragma(newKey));
  await db.closeAsync();
  db = await openKeyed(name, newKey);
  const n2 = await db.getFirstAsync<{ n: number }>(spikeSql.schemaObjectCount);
  await db.closeAsync();
  db = await openKeyed(name, key);
  const oldErr = await expectThrows(() => db.getFirstAsync(spikeSql.schemaObjectCount));
  await db.closeAsync();
  report({
    id: 'sqlcipher.reopenAndRekey',
    status: (n?.n ?? 0) > 0 && n2?.n === n?.n && oldErr ? 'pass' : 'fail',
    detail: `objects before=${n?.n} after rekey=${n2?.n}; old key after rekey ${oldErr ? 'rejected' : 'ACCEPTED'}`,
  });

  await SQLite.deleteDatabaseAsync(name);
}

// ── expo-crypto AES-GCM ───────────────────────────────────────────────────
async function checkAes(report: Report): Promise<void> {
  const key = await Crypto.AESEncryptionKey.import(hexToBytes(AES_VECTOR.keyHex));
  const iv = hexToBytes(AES_VECTOR.ivHex);
  const aad = utf8ToBytes(AES_VECTOR.aadUtf8);
  const plaintext = Uint8Array.from(atob(AES_VECTOR.plaintextB64), (c) => c.charCodeAt(0));

  const sealed = await Crypto.aesEncryptAsync(plaintext, key, {
    nonce: { bytes: iv },
    additionalData: aad,
  });
  const ct = await sealed.ciphertext({ includeTag: true });
  const ctHex = bytesToHex(ct);
  report({
    id: 'aes.encryptMatchesNodeVector',
    status: ctHex === AES_VECTOR.ciphertextWithTagHex ? 'pass' : 'fail',
    detail: ctHex === AES_VECTOR.ciphertextWithTagHex ? 'identical to Node WebCrypto' : `got ${ctHex}`,
  });

  const nodeSealed = Crypto.AESSealedData.fromParts(iv, hexToBytes(AES_VECTOR.ciphertextWithTagHex), 16);
  const dec = await Crypto.aesDecryptAsync(nodeSealed, key, { additionalData: aad });
  report({
    id: 'aes.decryptNodeVector',
    status: bytesToHex(dec) === bytesToHex(plaintext) ? 'pass' : 'fail',
    detail: 'Node-produced ciphertext decrypted on device',
  });

  const tampered = hexToBytes(AES_VECTOR.ciphertextWithTagHex);
  tampered[3] = (tampered[3] ?? 0) ^ 0x01;
  const tamperErr = await expectThrows(() =>
    Crypto.aesDecryptAsync(Crypto.AESSealedData.fromParts(iv, tampered, 16), key, { additionalData: aad }),
  );
  const aadErr = await expectThrows(() =>
    Crypto.aesDecryptAsync(nodeSealed, key, { additionalData: utf8ToBytes('other-aad') }),
  );
  report({
    id: 'aes.tamperRejected',
    status: tamperErr && aadErr ? 'pass' : 'fail',
    detail: `flipped ciphertext bit: ${tamperErr ? 'rejected' : 'ACCEPTED'}; wrong AAD: ${aadErr ? 'rejected' : 'ACCEPTED'}`,
  });
}

// ── scrypt (@noble/hashes) correctness + timing ──────────────────────────
export async function checkScrypt(report: Report, ns: number[]): Promise<void> {
  const pw = utf8ToBytes(SCRYPT_VECTOR.password);
  const salt = utf8ToBytes(SCRYPT_VECTOR.salt);
  for (const N of ns) {
    const t0 = Date.now();
    try {
      const out = await scryptAsync(pw, salt, {
        N,
        r: SCRYPT_VECTOR.r,
        p: SCRYPT_VECTOR.p,
        dkLen: SCRYPT_VECTOR.dkLen,
        asyncTick: 10,
        maxmem: 256 * 1024 * 1024,
      });
      const ms = Date.now() - t0;
      const ok = bytesToHex(out) === SCRYPT_VECTOR.expected[N];
      report({
        id: `scrypt.N${N}`,
        status: ok ? 'info' : 'fail',
        detail: `${ms} ms (r=8,p=1, ${(128 * 8 * N) / 1048576} MiB); output ${ok ? 'matches Node' : 'MISMATCH'}; build=${__DEV__ ? 'dev' : 'release'}`,
      });
    } catch (e) {
      report({ id: `scrypt.N${N}`, status: 'fail', detail: `error after ${Date.now() - t0} ms: ${errMsg(e)}` });
    }
  }
}

// ── SecureStore ───────────────────────────────────────────────────────────
async function checkSecureStore(report: Report): Promise<void> {
  const k = 'mm.spike.v1';
  const v = bytesToHex(await Crypto.getRandomBytesAsync(32));
  const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  await SecureStore.setItemAsync(k, v, opts);
  const back = await SecureStore.getItemAsync(k, opts);
  await SecureStore.deleteItemAsync(k, opts);
  const gone = await SecureStore.getItemAsync(k, opts);
  report({
    id: 'securestore.roundTrip',
    status: back === v && gone === null ? 'pass' : 'fail',
    detail: `write→read-back ${back === v ? 'equal' : 'DIFFERENT'}; after delete ${gone === null ? 'null' : 'STILL PRESENT'}`,
  });
}

// ── Platform capabilities ────────────────────────────────────────────────
async function checkPlatform(report: Report): Promise<void> {
  const hasPR = typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function';
  if (hasPR) {
    const pr = new Intl.PluralRules('ar');
    const bad = AR_PLURALS.filter(([n, cat]) => pr.select(n) !== cat).map(
      ([n, cat]) => `${n}: got ${pr.select(n)} want ${cat}`,
    );
    report({
      id: 'intl.pluralRulesArabic',
      status: bad.length ? 'fail' : 'pass',
      detail: bad.length ? bad.join('; ') : 'zero/one/two/few/many/other correct',
    });
  } else {
    report({ id: 'intl.pluralRulesArabic', status: 'fail', detail: 'Intl.PluralRules unavailable' });
  }

  report({
    id: 'rtl.state',
    status: 'info',
    detail: `I18nManager.isRTL=${I18nManager.isRTL}; doLeftAndRightSwapInRTL=${I18nManager.doLeftAndRightSwapInRTL}`,
  });

  const [hw, enrolled, level, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  report({
    id: 'localAuth.capabilities',
    status: 'info',
    detail: `hardware=${hw} enrolled=${enrolled} level=${LocalAuthentication.SecurityLevel[level]} types=[${types.join(',')}]`,
  });

  report({
    id: 'screenCapture.available',
    status: 'info',
    detail: `isAvailableAsync=${await ScreenCapture.isAvailableAsync()}`,
  });

  report({
    id: 'runtime',
    status: 'info',
    detail: `${Platform.OS} ${String(Platform.Version)}; hermes=${typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !== 'undefined'}; build=${__DEV__ ? 'dev' : 'release'}`,
  });
}

export async function runSpike(
  report: Report,
  opts: { scryptNs: number[] } = { scryptNs: [32768, 65536, 131072] },
): Promise<void> {
  const steps: [string, () => Promise<void>][] = [
    ['platform', () => checkPlatform(report)],
    ['sqlcipher', () => checkSqlCipher(report)],
    ['aes', () => checkAes(report)],
    ['securestore', () => checkSecureStore(report)],
    ['scrypt', () => checkScrypt(report, opts.scryptNs)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (e) {
      report({ id: `${name}.crashed`, status: 'fail', detail: errMsg(e) });
    }
  }
}

export function persistResults(results: SpikeResult[]): string {
  const json = JSON.stringify({ at: new Date().toISOString(), results }, null, 1);
  const f = new File(Paths.document, 'm0-spike-results.json');
  if (f.exists) f.delete();
  f.create();
  f.write(json);
  console.log(`[M0-SPIKE] ${JSON.stringify(results)}`);
  return f.uri;
}
