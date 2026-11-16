// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Privacy (ARCHITECTURE.md §8): no app-level network access, no telemetry or OTA packages.
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'My Money is offline-only: network APIs are banned (ARCHITECTURE.md §8).',
}));

const BANNED_IMPORTS = [
  'expo-updates',
  'expo-network',
  'expo-web-browser',
  'axios',
  '@sentry/react-native',
  'sentry-expo',
  '@react-native-firebase/app',
  'firebase',
  '@supabase/supabase-js',
].map((name) => ({ name, message: 'Banned dependency: My Money must not talk to the network.' }));

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'coverage/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'Network APIs are banned.' },
        { object: 'globalThis', property: 'fetch', message: 'Network APIs are banned.' },
        { object: 'window', property: 'fetch', message: 'Network APIs are banned.' },
      ],
      'no-restricted-imports': ['error', { paths: BANNED_IMPORTS }],
    },
  },
]);
