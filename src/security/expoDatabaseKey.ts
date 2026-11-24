import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { DatabaseKeyLifecycle } from '@/security/databaseKey';

const keyOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

export const databaseKeyLifecycle = new DatabaseKeyLifecycle(
  {
    getItem: (key) => SecureStore.getItemAsync(key, keyOptions),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, keyOptions),
  },
  (byteCount) => Crypto.getRandomBytesAsync(byteCount),
);
