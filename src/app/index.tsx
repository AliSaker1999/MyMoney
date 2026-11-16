import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { spikeEnabled } from '@/spike/enabled';

export default function Index() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'My Money' }} />
      <Text variant="headlineSmall">My Money</Text>
      <Text variant="bodyMedium">M0 scaffold. Features start in M1.</Text>
      {spikeEnabled ? (
        <Link href="/spike" asChild>
          <Button mode="contained" testID="open-spike">
            Run M0 compatibility spike
          </Button>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 16 },
});
