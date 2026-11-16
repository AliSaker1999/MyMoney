import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <PaperProvider theme={scheme === 'dark' ? MD3DarkTheme : MD3LightTheme}>
      <Stack />
    </PaperProvider>
  );
}
