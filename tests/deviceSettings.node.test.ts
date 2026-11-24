import {
  DEFAULT_DEVICE_SETTINGS,
  DeviceSettingsError,
  loadDeviceSettings,
  saveDeviceSettings,
  shouldLockOnResume,
  type DeviceSettingsStore,
} from '@/security/deviceSettings';

class MemoryDeviceSettings implements DeviceSettingsStore {
  value: string | null = null;

  async getItem(): Promise<string | null> {
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.value = value;
  }
}

describe('device security settings', () => {
  it('defaults to enabled app lock with a one-minute timeout', async () => {
    await expect(loadDeviceSettings(new MemoryDeviceSettings())).resolves.toEqual(
      DEFAULT_DEVICE_SETTINGS,
    );
  });

  it.each(['{', '{"appLockEnabled":true,"autoLockTimeout":30000}', 'null'])(
    'rejects malformed or unsupported settings %s',
    async (value) => {
      const store = new MemoryDeviceSettings();
      store.value = value;
      await expect(loadDeviceSettings(store)).rejects.toThrow(DeviceSettingsError);
    },
  );

  it('round-trips an allowed timeout without storing it in the ledger database', async () => {
    const store = new MemoryDeviceSettings();
    const settings = { appLockEnabled: false, autoLockTimeout: 300_000 as const };

    await saveDeviceSettings(store, settings);

    expect(store.value).toBe(JSON.stringify(settings));
    await expect(loadDeviceSettings(store)).resolves.toEqual(settings);
  });

  it('applies the selected lock timeout when returning from the background', () => {
    expect(shouldLockOnResume(DEFAULT_DEVICE_SETTINGS, 59_999)).toBe(false);
    expect(shouldLockOnResume(DEFAULT_DEVICE_SETTINGS, 60_000)).toBe(true);
    expect(
      shouldLockOnResume(
        { appLockEnabled: true, autoLockTimeout: 'immediate' },
        0,
      ),
    ).toBe(true);
    expect(
      shouldLockOnResume(
        { appLockEnabled: false, autoLockTimeout: 'immediate' },
        60_000,
      ),
    ).toBe(false);
  });
});
