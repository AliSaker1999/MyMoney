import { databaseKeyLifecycle } from '@/security/expoDatabaseKey';
import { DatabaseBootstrap } from '@/db/bootstrap';
import { ExpoDatabaseFactory, ExpoDatabaseRecoveryFiles } from '@/db/expoRecovery';

export const databaseBootstrap = new DatabaseBootstrap(
  databaseKeyLifecycle,
  new ExpoDatabaseRecoveryFiles(),
  new ExpoDatabaseFactory(),
);
