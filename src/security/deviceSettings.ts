import type { AppLanguage } from '@/i18n/language';

export type AutoLockTimeout = 'immediate' | 60_000 | 300_000 | 900_000;

export interface DeviceSettings {
  appLockEnabled: boolean;
  autoLockTimeout: AutoLockTimeout;
  language?: AppLanguage;
}

export interface DeviceSettingsStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  appLockEnabled: true,
  autoLockTimeout: 60_000,
};

const DEVICE_SETTINGS_KEY = 'mm.device-settings.v1';
const validTimeouts = new Set<AutoLockTimeout>(['immediate', 60_000, 300_000, 900_000]);

export class DeviceSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceSettingsError';
  }
}

export async function loadDeviceSettings(
  store: DeviceSettingsStore,
): Promise<DeviceSettings> {
  const value = await store.getItem(DEVICE_SETTINGS_KEY);
  if (value === null) return { ...DEFAULT_DEVICE_SETTINGS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new DeviceSettingsError('Saved device security settings are not valid JSON.');
  }

  if (!isDeviceSettings(parsed)) {
    throw new DeviceSettingsError('Saved device security settings are invalid.');
  }
  return parsed;
}

export async function saveDeviceSettings(
  store: DeviceSettingsStore,
  settings: DeviceSettings,
): Promise<void> {
  if (!isDeviceSettings(settings)) {
    throw new DeviceSettingsError('Device security settings are invalid.');
  }
  await store.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(settings));
}

export function shouldLockOnResume(settings: DeviceSettings, elapsedMs: number): boolean {
  return (
    settings.appLockEnabled &&
    (settings.autoLockTimeout === 'immediate' || elapsedMs >= settings.autoLockTimeout)
  );
}

function isDeviceSettings(value: unknown): value is DeviceSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.appLockEnabled === 'boolean' &&
    validTimeouts.has(settings.autoLockTimeout as AutoLockTimeout) &&
    (settings.language === undefined || settings.language === 'en' || settings.language === 'ar')
  );
}
