import { ExpoSqliteDriver } from '@/db/expoDriver';

export function openEncryptedDatabase(
  databaseName: string,
  key: Uint8Array,
  directory?: string,
): Promise<ExpoSqliteDriver> {
  return ExpoSqliteDriver.open(databaseName, key, directory);
}
