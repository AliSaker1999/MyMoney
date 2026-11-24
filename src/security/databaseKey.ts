import { AsyncMutex } from '@/db/asyncMutex';

const KEY_BYTES = 32;
const KEY_NAME = 'mm.dbkey.v1';
const RESET_CONFIRMATION = 'RESET';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type RandomBytes = (byteCount: number) => Promise<Uint8Array>;

export class DatabaseKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseKeyError';
  }
}

export class DatabaseKeyLifecycle {
  private readonly mutex = new AsyncMutex();
  private initialization?: Promise<Uint8Array>;

  constructor(
    private readonly store: KeyValueStore,
    private readonly randomBytes: RandomBytes,
  ) {}

  getExisting(): Promise<Uint8Array | null> {
    return this.mutex.runExclusive(async () => {
      const stored = await this.store.getItem(KEY_NAME);
      return stored === null ? null : decodeKey(stored);
    });
  }

  getOrCreate(): Promise<Uint8Array> {
    if (!this.initialization) {
      const initialization = this.mutex.runExclusive(() => this.loadOrCreate());
      this.initialization = initialization;
      void initialization.catch(() => {
        if (this.initialization === initialization) this.initialization = undefined;
      });
    }
    return this.initialization.then((key) => new Uint8Array(key));
  }

  async reset(confirmation: string): Promise<Uint8Array> {
    if (confirmation !== RESET_CONFIRMATION) {
      throw new DatabaseKeyError('Reset requires the exact typed confirmation.');
    }

    return this.mutex.runExclusive(async () => {
      this.initialization = undefined;
      const key = await this.generateKey();
      await this.store.setItem(KEY_NAME, encodeKey(key));
      const persisted = await this.store.getItem(KEY_NAME);
      if (persisted !== encodeKey(key)) {
        throw new DatabaseKeyError('The replacement database key could not be verified.');
      }
      return key;
    });
  }

  private async loadOrCreate(): Promise<Uint8Array> {
    const stored = await this.store.getItem(KEY_NAME);
    if (stored !== null) return decodeKey(stored);

    const key = await this.generateKey();
    const encoded = encodeKey(key);
    await this.store.setItem(KEY_NAME, encoded);
    const persisted = await this.store.getItem(KEY_NAME);
    if (persisted !== encoded) {
      throw new DatabaseKeyError('The new database key could not be verified.');
    }
    return key;
  }

  private async generateKey(): Promise<Uint8Array> {
    const key = await this.randomBytes(KEY_BYTES);
    if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) {
      throw new DatabaseKeyError('The secure random source returned an invalid database key.');
    }
    return new Uint8Array(key);
  }
}

function encodeKey(key: Uint8Array): string {
  let encoded = '';
  for (const byte of key) encoded += byte.toString(16).padStart(2, '0');
  return encoded;
}

function decodeKey(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new DatabaseKeyError('The stored database key is invalid; refusing to replace it.');
  }
  const key = new Uint8Array(KEY_BYTES);
  for (let index = 0; index < key.length; index += 1) {
    key[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return key;
}
