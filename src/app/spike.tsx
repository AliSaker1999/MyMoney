/**
 * M0 compatibility spike screen (dev builds, or release builds with EXPO_PUBLIC_SPIKE=1).
 *
 * Deep links used to drive it from adb:
 *   mymoney://spike                 run all checks
 *   mymoney://spike?rtl=on|off      force the layout direction, then reload the app (reloadAppAsync)
 *   mymoney://spike?secure=on|off   toggle FLAG_SECURE (expo-screen-capture)
 *   mymoney://spike?scrypt=0        skip the slow scrypt timings
 *
 * Chart values below are hard-coded spike samples, not user data.
 */
import { reloadAppAsync } from 'expo';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef, useState } from 'react';
import { I18nManager, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import {
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  List,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';

import { spikeEnabled } from '@/spike/enabled';
import { ResultRow } from '@/spike/ResultRow';
import { persistResults, runSpike, type SpikeResult } from '@/spike/runSpike';

const PIE = [
  { value: 45, color: '#4E79A7', text: '45' },
  { value: 30, color: '#F28E2B', text: '30' },
  { value: 25, color: '#59A14F', text: '25' },
];
const BARS = [
  { value: 12, label: 'A' },
  { value: 7, label: 'B' },
  { value: 15, label: 'C' },
  { value: 9, label: 'D' },
];
const LINE = [{ value: 3 }, { value: 8 }, { value: 5 }, { value: 11 }, { value: 9 }];

export default function SpikeScreen() {
  const params = useLocalSearchParams<{ rtl?: string; secure?: string; scrypt?: string }>();
  const [results, setResults] = useState<SpikeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [secure, setSecure] = useState(false);
  const [seg, setSeg] = useState('usd');
  const [text, setText] = useState('1,234.56');
  const started = useRef(false);

  // Direction switch driven by deep link: only reload when the direction actually changes.
  useEffect(() => {
    const want = params.rtl === 'on' ? true : params.rtl === 'off' ? false : null;
    if (want !== null && want !== I18nManager.isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(want);
      void reloadAppAsync('spike: layout direction change');
    }
  }, [params.rtl]);

  useEffect(() => {
    if (params.secure === 'on' || params.secure === 'off') void toggleSecure(params.secure === 'on');
  }, [params.secure]);

  async function toggleSecure(on: boolean) {
    if (on) await ScreenCapture.preventScreenCaptureAsync('spike');
    else await ScreenCapture.allowScreenCaptureAsync('spike');
    setSecure(on);
  }

  async function run() {
    setRunning(true);
    const acc: SpikeResult[] = [];
    setResults([]);
    await runSpike(
      (r) => {
        acc.push(r);
        setResults([...acc]);
      },
      { scryptNs: params.scrypt === '0' ? [] : [32768, 65536, 131072] },
    );
    setSavedAt(persistResults(acc));
    setRunning(false);
  }

  useEffect(() => {
    if (!started.current && params.rtl === undefined && params.secure === undefined) {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!spikeEnabled) return <Redirect href="/" />;

  return (
    <ScrollView contentContainerStyle={styles.content} testID="spike-scroll">
      <Stack.Screen options={{ title: 'M0 spike' }} />

      <Card mode="outlined">
        <Card.Title title="Checks" subtitle={running ? 'Running…' : savedAt ? 'Done, saved' : ''} />
        <Card.Content>
          {results.map((r) => (
            <ResultRow key={r.id} result={r} />
          ))}
        </Card.Content>
        <Card.Actions>
          <Button onPress={run} disabled={running} testID="rerun">
            Run again
          </Button>
        </Card.Actions>
      </Card>

      <Card mode="outlined">
        <Card.Title title="Layout direction" subtitle={`isRTL = ${I18nManager.isRTL}`} />
        <Card.Content style={styles.dirRow}>
          <Icon source="chevron-right" size={24} />
          <Text>Start ← text → End</Text>
          <View style={styles.startBox}>
            <Text>marginStart box</Text>
          </View>
        </Card.Content>
        <Card.Actions>
          <Button
            testID="rtl-toggle"
            onPress={() => {
              I18nManager.allowRTL(true);
              I18nManager.forceRTL(!I18nManager.isRTL);
              void reloadAppAsync('spike: layout direction change');
            }}>
            {I18nManager.isRTL ? 'Switch to LTR + reload' : 'Switch to RTL + reload'}
          </Button>
        </Card.Actions>
      </Card>

      <Card mode="outlined">
        <Card.Title title="FLAG_SECURE" subtitle={secure ? 'Screenshots blocked' : 'Screenshots allowed'} />
        <Card.Content style={styles.dirRow}>
          <Switch value={secure} onValueChange={(v) => void toggleSecure(v)} testID="secure-switch" />
        </Card.Content>
      </Card>

      <Card mode="outlined">
        <Card.Title title="react-native-paper" />
        <Card.Content style={styles.gap}>
          <TextInput label="Amount (spike)" value={text} onChangeText={setText} mode="outlined" />
          <SegmentedButtons
            value={seg}
            onValueChange={setSeg}
            buttons={[
              { value: 'usd', label: 'USD' },
              { value: 'lbp', label: 'LBP' },
            ]}
          />
          <View style={styles.dirRow}>
            <Chip icon="bank">Chip</Chip>
            <Chip icon="cash">Icon</Chip>
          </View>
          <List.Item title="List item" description="with icons" left={(p) => <List.Icon {...p} icon="wallet" />} />
          <Divider />
          <Button mode="contained" icon="check">
            Contained
          </Button>
        </Card.Content>
      </Card>

      <Card mode="outlined">
        <Card.Title title="react-native-gifted-charts" subtitle="spike sample values" />
        <Card.Content style={styles.gap}>
          <PieChart data={PIE} donut showText textColor="#fff" radius={70} innerRadius={35} />
          <BarChart data={BARS} barWidth={22} spacing={18} height={120} noOfSections={3} isAnimated={false} />
          <LineChart data={LINE} height={120} spacing={40} curved isAnimated={false} />
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  gap: { gap: 12 },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startBox: { marginStart: 16, padding: 4, borderWidth: 1, borderColor: '#888' },
});
