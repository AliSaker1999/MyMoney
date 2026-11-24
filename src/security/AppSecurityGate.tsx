import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/ui/controls';
import { StatusScreen } from '@/ui/StatusScreen';
import {
  loadDeviceSettings,
  saveDeviceSettings,
  shouldLockOnResume,
  type DeviceSettings,
} from '@/security/deviceSettings';
import { deviceSettingsStore } from '@/security/expoDeviceSettings';
import { setAppLanguage } from '@/i18n/direction';

const CAPTURE_LOCK_KEY = 'app-lock';

interface AppSecurityContextValue {
  settings: DeviceSettings;
  updateSettings(settings: DeviceSettings): Promise<void>;
}

const AppSecurityContext = createContext<AppSecurityContextValue | null>(null);

export function useAppSecuritySettings(): AppSecurityContextValue {
  const context = useContext(AppSecurityContext);
  if (!context) throw new Error('useAppSecuritySettings must be used inside AppSecurityGate.');
  return context;
}

export function AppSecurityGate({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [locked, setLocked] = useState(true);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [protectionState, setProtectionState] = useState<{
    enabled: boolean;
    attempt: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [protectionAttempt, setProtectionAttempt] = useState(0);
  const backgroundedAt = useRef<number | null>(null);
  const protectionReady =
    settings !== null &&
    protectionState?.enabled === settings.appLockEnabled &&
    protectionState.attempt === protectionAttempt;
  const wasAppLockEnabled = settings?.appLockEnabled ?? false;

  const updateSettings = useCallback(
    async (next: DeviceSettings) => {
      if (next.appLockEnabled) {
        const level = await LocalAuthentication.getEnrolledLevelAsync();
        if (level === LocalAuthentication.SecurityLevel.NONE) {
          throw new Error(t('security.secureDeviceRequired'));
        }
      }
      await saveDeviceSettings(deviceSettingsStore, next);
      setSettings(next);
      setLocked((currentlyLocked) => next.appLockEnabled && (currentlyLocked || !wasAppLockEnabled));
      if (next.language) await setAppLanguage(next.language);
      setError(null);
    },
    [t, wasAppLockEnabled],
  );
  const securityContext = useMemo(
    () => (settings ? { settings, updateSettings } : null),
    [settings, updateSettings],
  );

  useEffect(() => {
    let active = true;
    void loadDeviceSettings(deviceSettingsStore)
      .then(async (loaded) => {
        if (loaded.language) await setAppLanguage(loaded.language);
        if (!active) return;
        setSettings(loaded);
        setLocked(loaded.appLockEnabled);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(errorMessage(cause, i18n.t('common.error')));
      });

    return () => {
      active = false;
    };
    // Load once. Depending on `t` caused an endless reload loop: loading applies the saved
    // language, which changes `t`, which re-ran this effect and discarded the result.
  }, [i18n]);

  useEffect(() => {
    if (!settings) return;
    let active = true;
    const updateProtection = settings.appLockEnabled
      ? ScreenCapture.preventScreenCaptureAsync(CAPTURE_LOCK_KEY)
      : ScreenCapture.allowScreenCaptureAsync(CAPTURE_LOCK_KEY);

    void updateProtection
      .then(() => {
        if (active) {
          setProtectionState({
            enabled: settings.appLockEnabled,
            attempt: protectionAttempt,
          });
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, t('common.error')));
      });

    return () => {
      active = false;
    };
  }, [settings, protectionAttempt, t]);

  useEffect(() => {
    if (!settings) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setPrivacyVisible(true);
        backgroundedAt.current ??= Date.now();
        return;
      }

      const elapsed = backgroundedAt.current === null ? 0 : Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      setPrivacyVisible(false);
      if (shouldLockOnResume(settings, elapsed)) {
        setLocked(true);
      }
    });

    return () => subscription.remove();
  }, [settings]);

  const authenticate = async () => {
    setError(null);
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setError(t('security.secureDeviceRequired'));
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('security.unlock'),
        disableDeviceFallback: false,
        biometricsSecurityLevel: 'strong',
      });
      if (result.success) {
        setLocked(false);
      } else {
        setError(t('security.authenticationFailed'));
      }
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  const disableWithoutDeviceLock = async () => {
    if (!settings) return;
    const next = { ...settings, appLockEnabled: false };
    try {
      await updateSettings(next);
    } catch (cause) {
      setError(errorMessage(cause, t('common.error')));
    }
  };

  if (!settings) {
    return (
      <StatusScreen icon="wallet-outline" message={error} loading={!error} />
    );
  }

  return (
    <AppSecurityContext.Provider value={securityContext}>
      <View style={styles.root}>
        {protectionReady && !locked ? children : null}
        {(locked || privacyVisible) && (
          <StatusScreen
            overlay
            icon={locked ? 'lock-outline' : 'eye-off-outline'}
            title={locked ? t('security.unlock') : t('security.privacyOverlay')}
            message={locked ? error : null}
            loading={locked && !protectionReady && settings.appLockEnabled}
          >
            {locked ? (
              <>
                {!protectionReady && settings.appLockEnabled ? null : (
                  <AppButton icon="fingerprint" disabled={!protectionReady} onPress={() => void authenticate()}>
                    {t('security.unlock')}
                  </AppButton>
                )}
                {error === t('security.secureDeviceRequired') ? (
                  <AppButton variant="ghost" onPress={() => void disableWithoutDeviceLock()}>
                    {t('security.disableAppLock')}
                  </AppButton>
                ) : null}
                {!protectionReady ? (
                  <AppButton variant="secondary" icon="refresh" onPress={() => setProtectionAttempt((attempt) => attempt + 1)}>
                    {t('security.retry')}
                  </AppButton>
                ) : null}
              </>
            ) : null}
          </StatusScreen>
        )}
      </View>
    </AppSecurityContext.Provider>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
