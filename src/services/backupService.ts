import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbDriver } from '@/db/driver';
import { backupSql } from '@/db/sql/backup.sql';
import { latestSchemaVersion } from '@/db/migrations';

export interface BackupEnvelope {
  format: 'mymoney-backup';
  formatVersion: 1;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  kdf: {
    alg: 'scrypt';
    N: number;
    r: number;
    p: number;
    salt: string;
  };
  cipher: {
    alg: 'AES-256-GCM';
    iv: string;
    tagLength: 16;
  };
  ciphertext: string;
}

export interface BackupCryptoProvider {
  randomBytes?(length: number): Promise<Uint8Array>;
  encrypt(plaintext: Uint8Array, key: Uint8Array, iv: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  decrypt(ciphertextWithTag: Uint8Array, key: Uint8Array, iv: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function createBackupSnapshot(database: DbDriver): Promise<{
  manifest: {
    schemaVersion: number;
    rowCounts: Record<string, number>;
    accountBalances: Record<string, string>;
    tableDigests: Record<string, string>;
  };
  tables: Record<string, object[]>;
}> {
  return database.exclusiveTransaction(async (transaction) => {
    const tableStatements: readonly [string, string][] = [
      ['schema_migrations', backupSql.dumpSchemaMigrations],
      ['rate_sources', backupSql.dumpRateSources],
      ['exchange_rates', backupSql.dumpExchangeRates],
      ['accounts', backupSql.dumpAccounts],
      ['categories', backupSql.dumpCategories],
      ['transactions', backupSql.dumpTransactions],
      ['entries', backupSql.dumpEntries],
      ['budgets', backupSql.dumpBudgets],
      ['goals', backupSql.dumpGoals],
      ['goal_contributions', backupSql.dumpGoalContributions],
      ['debts', backupSql.dumpDebts],
      ['debt_movements', backupSql.dumpDebtMovements],
      ['settings', backupSql.dumpSettings],
    ];
    const tables: Record<string, object[]> = {};
    const rowCounts: Record<string, number> = {};
    const tableDigests: Record<string, string> = {};
    for (const [name, sql] of tableStatements) {
      const rows = await transaction.all<object>(sql);
      tables[name] = rows;
      rowCounts[name] = rows.length;
      tableDigests[name] = digestJson(rows);
    }
    const balances = await transaction.all<{ account_id: number; currency: string; balance_minor: string }>(backupSql.accountBalances);
    const accountBalances: Record<string, string> = {};
    for (const row of balances) accountBalances[String(row.account_id)] = row.balance_minor;
    return {
      manifest: {
        schemaVersion: latestSchemaVersion,
        rowCounts,
        accountBalances,
        tableDigests,
      },
      tables,
    };
  });
}

export async function exportEncryptedBackup(
  database: DbDriver,
  password: string,
  appVersion: string,
  cryptoProvider: BackupCryptoProvider = webCryptoBackupProvider(),
  now: () => string = () => new Date().toISOString(),
): Promise<BackupEnvelope> {
  validatePassword(password);
  const snapshot = await createBackupSnapshot(database);
  const salt = cryptoProvider.randomBytes
    ? await cryptoProvider.randomBytes(16)
    : cryptoRandomBytes(16);
  const iv = cryptoProvider.randomBytes
    ? await cryptoProvider.randomBytes(12)
    : cryptoRandomBytes(12);
  const key = deriveScrypt(password, salt);
  const header = {
    format: 'mymoney-backup' as const,
    formatVersion: 1 as const,
    createdAt: now(),
    appVersion,
    schemaVersion: latestSchemaVersion,
    kdf: { alg: 'scrypt' as const, N: 65_536, r: 8, p: 1, salt: bytesToBase64(salt) },
    cipher: { alg: 'AES-256-GCM' as const, iv: bytesToBase64(iv), tagLength: 16 as const },
  };
  const plaintext = utf8Bytes(JSON.stringify(snapshot));
  const ciphertext = await cryptoProvider.encrypt(plaintext, key, iv, utf8Bytes(canonicalJson(header)));
  return { ...header, ciphertext: bytesToBase64(ciphertext) };
}

const backupEnvelopeSchema = z.object({
  format: z.literal('mymoney-backup'),
  formatVersion: z.literal(1),
  createdAt: z.string(),
  appVersion: z.string(),
  schemaVersion: z.number().int().positive(),
  kdf: z.object({
    alg: z.literal('scrypt'),
    N: z.number().int(),
    r: z.number().int(),
    p: z.number().int(),
    salt: z.string(),
  }),
  cipher: z.object({
    alg: z.literal('AES-256-GCM'),
    iv: z.string(),
    tagLength: z.literal(16),
  }),
  ciphertext: z.string(),
});

const backupSnapshotSchema = z.object({
  manifest: z.object({
    schemaVersion: z.number().int().positive(),
    rowCounts: z.record(z.string(), z.number().int().nonnegative()),
    accountBalances: z.record(z.string(), z.string()),
    tableDigests: z.record(z.string(), z.string()),
  }),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>;

export function parseBackupEnvelope(value: unknown): BackupEnvelope {
  const parsed = backupEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new BackupError('Invalid backup header or envelope.');
  validateBackupHeader(parsed.data);
  if (parsed.data.schemaVersion > latestSchemaVersion) {
    throw new BackupError('The backup was created by a newer unsupported app version.');
  }
  return parsed.data;
}

export async function decryptBackupSnapshot(
  envelopeValue: unknown,
  password: string,
  cryptoProvider: BackupCryptoProvider = webCryptoBackupProvider(),
): Promise<BackupSnapshot> {
  validatePassword(password);
  const envelope = parseBackupEnvelope(envelopeValue);
  const key = deriveScrypt(password, base64Bytes(envelope.kdf.salt), envelope.kdf.N);
  const header = {
    format: envelope.format,
    formatVersion: envelope.formatVersion,
    createdAt: envelope.createdAt,
    appVersion: envelope.appVersion,
    schemaVersion: envelope.schemaVersion,
    kdf: envelope.kdf,
    cipher: envelope.cipher,
  };
  let plaintext: Uint8Array;
  try {
    plaintext = await cryptoProvider.decrypt(
      base64Bytes(envelope.ciphertext),
      key,
      base64Bytes(envelope.cipher.iv),
      utf8Bytes(canonicalJson(header)),
    );
  } catch {
    throw new BackupError('Wrong password or damaged backup.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new BackupError('The decrypted backup contains invalid JSON.');
  }
  const parsed = backupSnapshotSchema.safeParse(parsedJson);
  if (!parsed.success) throw new BackupError('The decrypted backup has invalid content.');
  verifyBackupManifest(parsed.data);
  return parsed.data;
}

export function verifyBackupManifest(snapshot: BackupSnapshot): void {
  if (
    snapshot.manifest.schemaVersion < 1
    || snapshot.manifest.schemaVersion > latestSchemaVersion
  ) throw new BackupError('The backup schema manifest is unsupported.');
  for (const [tableName, rows] of Object.entries(snapshot.tables)) {
    if (snapshot.manifest.rowCounts[tableName] !== rows.length) {
      throw new BackupError(`The backup row count for ${tableName} does not match.`);
    }
    if (snapshot.manifest.tableDigests[tableName] !== digestJson(rows)) {
      throw new BackupError(`The backup digest for ${tableName} does not match.`);
    }
  }
  for (const [tableName, count] of Object.entries(snapshot.manifest.rowCounts)) {
    if (snapshot.tables[tableName] === undefined || snapshot.tables[tableName]?.length !== count) {
      throw new BackupError(`The backup manifest for ${tableName} is inconsistent.`);
    }
  }
}

export function validateBackupPassword(password: string): void {
  validatePassword(password);
}

export function deriveScrypt(password: string, salt: Uint8Array, N = 65_536): Uint8Array {
  validateBackupHeaderKdf(N, 8, 1);
  return scrypt(utf8Bytes(password), salt, { N, r: 8, p: 1, dkLen: 32, maxmem: 256 * 1024 * 1024 });
}

export function validateBackupHeader(
  header: Pick<BackupEnvelope, 'format' | 'formatVersion' | 'kdf' | 'cipher'>,
): void {
  if (header.format !== 'mymoney-backup' || header.formatVersion !== 1) {
    throw new BackupError('Unsupported backup format.');
  }
  validateBackupHeaderKdf(header.kdf.N, header.kdf.r, header.kdf.p);
  if (header.kdf.alg !== 'scrypt' || header.cipher.alg !== 'AES-256-GCM' || header.cipher.tagLength !== 16) {
    throw new BackupError('Unsupported backup crypto header.');
  }
  if (base64Bytes(header.kdf.salt).length !== 16 || base64Bytes(header.cipher.iv).length !== 12) {
    throw new BackupError('Invalid backup salt or IV.');
  }
}

export function canonicalJson(value: object): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonValue(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJsonValue(record[key])}`,
  ).join(',')}}`;
}

export function digestJson(value: unknown): string {
  return bytesToHex(sha256(utf8Bytes(canonicalJsonValue(value))));
}

function canonicalJsonValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJsonValue(item)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJsonValue(record[key])}`,
    ).join(',')}}`;
  }
  return 'null';
}

function validatePassword(password: string): void {
  if (password.length < 12) throw new BackupError('The backup password must contain at least 12 characters.');
}

function validateBackupHeaderKdf(N: number, r: number, p: number): void {
  if (!Number.isInteger(N) || N < 16_384 || N > 131_072 || (N & (N - 1)) !== 0) {
    throw new BackupError('Invalid backup scrypt N.');
  }
  if (!Number.isInteger(r) || r < 1 || r > 8 || !Number.isInteger(p) || p < 1 || p > 1) {
    throw new BackupError('Invalid backup scrypt parameters.');
  }
}

function webCryptoBackupProvider(): BackupCryptoProvider {
  return {
    async encrypt(plaintext, key, iv, aad) {
      const subtle = getSubtleCrypto();
      const cryptoKey = await subtle.importKey('raw', toArrayBufferView(key), { name: 'AES-GCM' }, false, ['encrypt']);
      const result = await subtle.encrypt(
        { name: 'AES-GCM', iv: toArrayBufferView(iv), additionalData: toArrayBufferView(aad), tagLength: 128 },
        cryptoKey,
        toArrayBufferView(plaintext),
      );
      return new Uint8Array(result);
    },
    async decrypt(ciphertextWithTag, key, iv, aad) {
      const subtle = getSubtleCrypto();
      const cryptoKey = await subtle.importKey('raw', toArrayBufferView(key), { name: 'AES-GCM' }, false, ['decrypt']);
      const result = await subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBufferView(iv), additionalData: toArrayBufferView(aad), tagLength: 128 },
        cryptoKey,
        toArrayBufferView(ciphertextWithTag),
      );
      return new Uint8Array(result);
    },
  };
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new BackupError('AES-GCM is unavailable in this runtime.');
  return subtle;
}

function cryptoRandomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) throw new BackupError('Secure random bytes are unavailable.');
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
