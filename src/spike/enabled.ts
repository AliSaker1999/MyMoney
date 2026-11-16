/** The M0 spike route exists in dev builds, or in release builds made with EXPO_PUBLIC_SPIKE=1. */
export const spikeEnabled: boolean = __DEV__ || process.env.EXPO_PUBLIC_SPIKE === '1';
