import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

/**
 * Loads data whenever the screen gains focus (so tabs refresh after a child screen saves), with a
 * pull-to-refresh flag and stale-response protection.
 */
export function useFocusData<T>(load: () => Promise<T>, onError: (cause: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const run = useCallback(
    async (isRefresh: boolean) => {
      const current = ++generation.current;
      if (isRefresh) setRefreshing(true);
      try {
        const next = await load();
        if (current === generation.current) setData(next);
      } catch (cause) {
        if (current === generation.current) onError(cause);
      } finally {
        if (current === generation.current) setRefreshing(false);
      }
    },
    [load, onError],
  );

  useFocusEffect(
    useCallback(() => {
      void run(false);
      return () => {
        generation.current += 1;
      };
    }, [run]),
  );

  return { data, refreshing, refresh: () => void run(true), reload: () => run(false) };
}
