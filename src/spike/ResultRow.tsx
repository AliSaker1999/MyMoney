import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { SpikeResult } from './runSpike';

const MARK: Record<SpikeResult['status'], string> = { pass: 'PASS', fail: 'FAIL', info: 'INFO' };

export function ResultRow({ result }: { result: SpikeResult }) {
  return (
    <View style={styles.row} testID={`result-${result.id}`}>
      <Text variant="labelLarge" style={result.status === 'fail' ? styles.fail : undefined}>
        {MARK[result.status]} · {result.id}
      </Text>
      <Text variant="bodySmall">{result.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6, gap: 2 },
  fail: { color: '#B3261E' },
});
