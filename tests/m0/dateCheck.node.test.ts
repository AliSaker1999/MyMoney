import Database from 'better-sqlite3';

import { spikeSql } from '@/db/sql/spike.sql';
import { DATE_MATRIX } from '@/spike/fixtures';

// The same matrix runs on the device (src/spike/runSpike.ts → sqlite.dateCheck).
describe('CHECK (date(col) IS col) on better-sqlite3', () => {
  const db = new Database(':memory:');
  db.exec(spikeSql.createDateProbe);
  const insert = db.prepare(spikeSql.insertDateProbe);

  it('reports the bundled SQLite version', () => {
    const { v } = db.prepare(spikeSql.sqliteVersion).get() as { v: string };
    expect(v).toMatch(/^3\.\d+\.\d+$/);
  });

  it.each(DATE_MATRIX.map((r) => [r.value, r.accept, r.why] as const))(
    '%j → accept=%s (%s)',
    (value, accept) => {
      const run = () => insert.run(value);
      // Rejection is what matters. 'now' fails with "non-deterministic use of date() in a
      // CHECK constraint" instead of "CHECK constraint failed"; both are rejections.
      if (accept) expect(run).not.toThrow();
      else expect(run).toThrow(/CHECK constraint failed|non-deterministic use of date\(\)/);
    },
  );
});
