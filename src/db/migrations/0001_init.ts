import { schemaV1Statements } from '@/db/sql/schema.sql';
import type { Migration } from '@/db/migrations/types';

export const initialMigration: Migration = {
  version: 1,
  name: 'init',
  statements: schemaV1Statements,
};
