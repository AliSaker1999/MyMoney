import '@/i18n';

import { LocaleProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { normalizeLanguage } from '@/i18n/language';
import { AppSecurityGate } from '@/security/AppSecurityGate';
import { DatabaseProvider } from '@/db/DatabaseProvider';
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
