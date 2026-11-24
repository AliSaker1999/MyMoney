import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTokens } from '@/ui/theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const icon = (outline: string, filled: string) =>
    function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
      return <Icon source={focused ? filled : outline} size={24} color={String(color)} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tokens.bg },
        headerTintColor: tokens.text,
        headerTitleStyle: { fontSize: 22, fontWeight: '700', color: tokens.text },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: tokens.bg },
        tabBarActiveTintColor: tokens.primary,
        tabBarInactiveTintColor: tokens.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: tokens.surface,
          borderTopColor: tokens.border,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 8) : insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.dashboard'),
          headerShown: false,
          tabBarIcon: icon('view-dashboard-outline', 'view-dashboard'),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('transactions.title'),
          tabBarIcon: icon('swap-vertical', 'swap-vertical-bold'),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('reports.title'),
          tabBarIcon: icon('chart-box-outline', 'chart-box'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('nav.more'),
          tabBarIcon: icon('dots-grid', 'dots-grid'),
        }}
      />
    </Tabs>
  );
}
