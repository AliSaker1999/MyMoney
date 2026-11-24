import {
  DatabaseKeyError,
  DatabaseKeyLifecycle,
  type KeyValueStore,
} from '@/security/databaseKey';

const KEY_NAME = 'mm.dbkey.v1';

class MemoryKeyStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  writes = 0;

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.values.set(key, value);
  }
}

function randomKey(byteCount: number): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array(byteCount).fill(0x5a));
}

describe('database key lifecycle', () => {
  it('creates a key only when absent and verifies the stored value', async () => {
    const store = new MemoryKeyStore();
    const lifecycle = new DatabaseKeyLifecycle(store, randomKey);

    await expect(lifecycle.getOrCreate()).resolves.toEqual(
      new Uint8Array(32).fill(0x5a),
    );
    expect(store.values.get(KEY_NAME)).toBe('5a'.repeat(32));
    expect(store.writes).toBe(1);
  });

  it('never overwrites a pre-existing key, even if its value is invalid', async () => {
    const store = new MemoryKeyStore();
    store.values.set(KEY_NAME, 'invalid');
    const lifecycle = new DatabaseKeyLifecycle(store, randomKey);

    await expect(lifecycle.getOrCreate()).rejects.toThrow(DatabaseKeyError);
    expect(store.writes).toBe(0);
    expect(store.values.get(KEY_NAME)).toBe('invalid');
  });

  it('uses a valid existing key without generating or rewriting it', async () => {
    const store = new MemoryKeyStore();
    store.values.set(KEY_NAME, '2b'.repeat(32));
    let randomCalls = 0;
    const lifecycle = new DatabaseKeyLifecycle(store, async (byteCount) => {
      randomCalls += 1;
      return new Uint8Array(byteCount);
    });

    await expect(lifecycle.getOrCreate()).resolves.toEqual(
      new Uint8Array(32).fill(0x2b),
    );
    expect(store.writes).toBe(0);
    expect(randomCalls).toBe(0);
  });

  it('single-flights concurrent first-run key creation', async () => {
    const store = new MemoryKeyStore();
    let randomCalls = 0;
    const lifecycle = new DatabaseKeyLifecycle(store, async (byteCount) => {
      randomCalls += 1;
      await Promise.resolve();
      return new Uint8Array(byteCount).fill(0x23);
    });

    const [first, second, third] = await Promise.all([
      lifecycle.getOrCreate(),
      lifecycle.getOrCreate(),
      lifecycle.getOrCreate(),
    ]);

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(randomCalls).toBe(1);
    expect(store.writes).toBe(1);
  });

  it('replaces a key only after exact typed reset confirmation', async () => {
    const store = new MemoryKeyStore();
    store.values.set(KEY_NAME, '11'.repeat(32));
    const lifecycle = new DatabaseKeyLifecycle(store, randomKey);

    await expect(lifecycle.reset('reset')).rejects.toThrow(DatabaseKeyError);
    expect(store.values.get(KEY_NAME)).toBe('11'.repeat(32));
    await expect(lifecycle.reset('RESET')).resolves.toEqual(
      new Uint8Array(32).fill(0x5a),
    );
    expect(store.values.get(KEY_NAME)).toBe('5a'.repeat(32));
  });
});
