import * as SecureStore from 'expo-secure-store';

import type { DeviceSettingsStore } from '@/security/deviceSettings';

export const deviceSettingsStore: DeviceSettingsStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
};
