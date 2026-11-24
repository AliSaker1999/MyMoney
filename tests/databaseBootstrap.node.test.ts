import Database from 'better-sqlite3';

import {
  DatabaseBootstrap,
  type DatabaseFactory,
  type DatabaseRecoveryFiles,
  type RecoveryCandidate,
} from '@/db/bootstrap';
import { BetterSqliteDriver } from '@/db/betterSqliteDriver';
import { DatabaseUnlockError, type DbDriver } from '@/db/driver';
import { migrateDatabase } from '@/db/migrations';
import { DatabaseKeyLifecycle as KeyLifecycle } from '@/security/databaseKey';

const candidate: RecoveryCandidate = {
  id: 'safety:/safety/copy.db',
  name: 'copy.db',
  source: 'safety',
  directory: '/safety',
  modifiedAt: 1_800_000_000_000,
};

class MemoryStore {
  value: string | null = null;
  writes = 0;

  async getItem(): Promise<string | null> {
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.value = value;
    this.writes += 1;
  }
}

class MemoryFiles implements DatabaseRecoveryFiles {
  exists = false;
  candidates: RecoveryCandidate[] = [];
  quarantines = 0;
  installs = 0;
  safetyCopies = 0;

  async mainExists(): Promise<boolean> {
    return this.exists;
  }

  async quarantineMain(): Promise<void> {
    this.exists = false;
    this.quarantines += 1;
  }

  async listCandidates(): Promise<RecoveryCandidate[]> {
    return [...this.candidates];
  }

  async createSafetyCopy(): Promise<void> {
    this.safetyCopies += 1;
  }

  async copyCandidateToMain(): Promise<void> {
    this.exists = true;
    this.installs += 1;
  }
}

class MemoryFactory implements DatabaseFactory {
  mainUnlocks = true;
  mainOpens = 0;

  async openMain(): Promise<DbDriver> {
    this.mainOpens += 1;
    if (!this.mainUnlocks) throw new DatabaseUnlockError(new Error('wrong key'));
    return this.openMigratedDatabase();
  }

  async openCandidate(): Promise<DbDriver> {
    return this.openMigratedDatabase();
  }

  private async openMigratedDatabase(): Promise<DbDriver> {
    const database = BetterSqliteDriver.open(new Database(':memory:'));
    await migrateDatabase(database);
    return database;
  }
}

function createLifecycle(store = new MemoryStore()) {
  const lifecycle = new KeyLifecycle(store, async (byteCount) =>
    new Uint8Array(byteCount).fill(0x43),
  );
  return { lifecycle, store };
}

describe('database bootstrap and recovery', () => {
  it('creates a single key and a migrated database on first run', async () => {
    const { lifecycle, store } = createLifecycle();
    const files = new MemoryFiles();
    const factory = new MemoryFactory();
    const bootstrap = new DatabaseBootstrap(lifecycle, files, factory);

    const [state, concurrentState] = await Promise.all([
      bootstrap.initialize(),
      bootstrap.initialize(),
    ]);

    expect(state.status).toBe('ready');
    expect(concurrentState).toBe(state);
    expect(factory.mainOpens).toBe(1);
    expect(store.value).toBe('43'.repeat(32));
    expect(store.writes).toBe(1);
    if (state.status === 'ready') await state.database.close();
  });

  it('offers candidates before creating a fresh database when the keyed main file is missing', async () => {
    const { lifecycle } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.candidates = [candidate];
    const bootstrap = new DatabaseBootstrap(lifecycle, files, new MemoryFactory());

    const state = await bootstrap.initialize();

    expect(state).toMatchObject({
      status: 'recovery',
      reason: 'main-missing',
      candidates: [{ id: candidate.id, source: 'safety' }],
    });
  });

  it('surfaces safety, quarantine, and replaced database candidates', async () => {
    const { lifecycle } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.candidates = [
      candidate,
      { ...candidate, id: 'quarantine:/quarantine/copy.db', source: 'quarantine' },
      { ...candidate, id: 'replaced:/replaced-copy.db', source: 'replaced' },
    ];
    const bootstrap = new DatabaseBootstrap(lifecycle, files, new MemoryFactory());

    const state = await bootstrap.initialize();

    expect(state.status).toBe('recovery');
    if (state.status === 'recovery') {
      expect(state.candidates.map((item) => item.source).sort()).toEqual([
        'quarantine',
        'replaced',
        'safety',
      ]);
    }
  });

  it('installs a chosen candidate, keeps it as a source, and opens the main database', async () => {
    const { lifecycle } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.candidates = [candidate];
    const bootstrap = new DatabaseBootstrap(lifecycle, files, new MemoryFactory());

    await bootstrap.initialize();
    const state = await bootstrap.useCandidate(candidate.id);

    expect(state.status).toBe('ready');
    expect(files.installs).toBe(1);
    expect(files.quarantines).toBe(0);
    if (state.status === 'ready') await state.database.close();
  });

  it('returns to recovery if an installed copy cannot be opened as the main database', async () => {
    const { lifecycle } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.candidates = [candidate];
    const factory = new MemoryFactory();
    const bootstrap = new DatabaseBootstrap(lifecycle, files, factory);

    await bootstrap.initialize();
    factory.mainUnlocks = false;
    const state = await bootstrap.useCandidate(candidate.id);

    expect(state).toMatchObject({
      status: 'recovery',
      reason: 'main-unreadable',
      candidates: [{ id: candidate.id }],
    });
  });

  it('quarantines a main database without regenerating a missing key', async () => {
    const { lifecycle, store } = createLifecycle();
    const files = new MemoryFiles();
    files.exists = true;
    const bootstrap = new DatabaseBootstrap(lifecycle, files, new MemoryFactory());

    const state = await bootstrap.initialize();

    expect(state).toMatchObject({ status: 'recovery', reason: 'key-missing' });
    expect(files.quarantines).toBe(1);
    expect(store.value).toBeNull();
    expect(store.writes).toBe(0);
  });

  it('does not replace a malformed stored key outside explicit reset', async () => {
    const { lifecycle, store } = createLifecycle();
    store.value = 'damaged';
    const files = new MemoryFiles();
    files.exists = true;
    const bootstrap = new DatabaseBootstrap(lifecycle, files, new MemoryFactory());

    const state = await bootstrap.initialize();

    expect(state).toMatchObject({ status: 'recovery', reason: 'key-invalid' });
    expect(files.quarantines).toBe(1);
    expect(store.value).toBe('damaged');
    expect(store.writes).toBe(0);
  });

  it('quarantines an unreadable main file and surfaces valid prior copies', async () => {
    const { lifecycle } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.exists = true;
    files.candidates = [candidate];
    const factory = new MemoryFactory();
    factory.mainUnlocks = false;
    const bootstrap = new DatabaseBootstrap(lifecycle, files, factory);

    const state = await bootstrap.initialize();

    expect(state).toMatchObject({
      status: 'recovery',
      reason: 'main-unreadable',
      candidates: [{ id: candidate.id }],
    });
    expect(files.quarantines).toBe(1);
  });

  it('starts fresh with the same key only after declining recovery for a missing main file', async () => {
    const { lifecycle, store } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.candidates = [candidate];
    const bootstrap = new DatabaseBootstrap(lifecycle, files, new MemoryFactory());

    await bootstrap.initialize();
    const state = await bootstrap.startFresh();

    expect(state.status).toBe('ready');
    expect(store.writes).toBe(1);
    if (state.status === 'ready') await state.database.close();
  });

  it('requires typed confirmation for reset and retains recovery files', async () => {
    const { lifecycle, store } = createLifecycle();
    await lifecycle.getOrCreate();
    const files = new MemoryFiles();
    files.exists = true;
    files.candidates = [candidate];
    const factory = new MemoryFactory();
    factory.mainUnlocks = false;
    const bootstrap = new DatabaseBootstrap(lifecycle, files, factory);
    await bootstrap.initialize();

    await expect(bootstrap.reset('reset')).rejects.toThrow();
    factory.mainUnlocks = true;
    const state = await bootstrap.reset('RESET');

    expect(state.status).toBe('ready');
    expect(store.writes).toBe(2);
    expect(files.quarantines).toBe(1);
    expect(files.candidates).toEqual([candidate]);
    if (state.status === 'ready') await state.database.close();
  });
});
