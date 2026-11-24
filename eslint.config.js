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
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='marginLeft']",
          message: 'Use marginStart/marginEnd for correct RTL layout.',
        },
        {
          selector: "Property[key.name='marginRight']",
          message: 'Use marginStart/marginEnd for correct RTL layout.',
        },
        {
          selector: "Property[key.name='paddingLeft']",
          message: 'Use paddingStart/paddingEnd for correct RTL layout.',
        },
        {
          selector: "Property[key.name='paddingRight']",
          message: 'Use paddingStart/paddingEnd for correct RTL layout.',
        },
      ],
    },
  },
  {
    files: ['src/domain/money/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Money parsing must use exact integer arithmetic.' },
        { name: 'Number', message: 'Money calculations must remain in BigInt.' },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'toFixed', message: 'Money formatting must not round binary floats.' },
        { object: 'Math', property: 'round', message: 'Use the approved half-even BigInt rounding.' },
      ],
    },
  },
  {
    files: ['src/app/**/*.tsx', 'src/features/**/*.tsx', 'src/ui/**/*.tsx'],
    ignores: ['src/app/spike.tsx'],
    rules: {
      'react/jsx-no-literals': 'error',
    },
  },
]);
