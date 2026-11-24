import '@/i18n';

import { LocaleProvider, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { normalizeLanguage } from '@/i18n/language';
import { AppSecurityGate } from '@/security/AppSecurityGate';
import { DatabaseProvider } from '@/db/DatabaseProvider';
import { AppButton } from '@/ui/controls';
import { StatusScreen } from '@/ui/StatusScreen';
import { darkTheme, lightTheme } from '@/ui/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const { i18n } = useTranslation();
  const direction = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) === 'ar' ? 'rtl' : 'ltr';
  const theme = scheme === 'dark' ? darkTheme : lightTheme;
  const { tokens } = theme;

  return (
    <PaperProvider theme={theme}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <LocaleProvider direction={direction}>
        <AppSecurityGate>
          <DatabaseProvider>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: tokens.bg },
                headerTintColor: tokens.text,
                headerTitleStyle: { fontSize: 18, fontWeight: '700', color: tokens.text },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: tokens.bg },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding/index" options={{ headerShown: false, animation: 'fade' }} />
              <Stack.Screen
                name="transactions/new"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </DatabaseProvider>
        </AppSecurityGate>
      </LocaleProvider>
    </PaperProvider>
  );
}

/**
 * Last-resort screen for unexpected rendering errors: the app stays open and the user can retry,
 * instead of the process being killed. Rendered outside RootLayout, so it brings its own theme.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const scheme = useColorScheme();
  const { t } = useTranslation();
  return (
    <PaperProvider theme={scheme === 'dark' ? darkTheme : lightTheme}>
      <StatusScreen icon="alert-circle-outline" tint="negative" title={t('common.error')} message={error.message}>
        <AppButton icon="refresh" onPress={() => void retry()}>
          {t('security.retry')}
        </AppButton>
      </StatusScreen>
    </PaperProvider>
  );
}
