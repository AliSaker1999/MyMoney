import pkg from '../../package.json';

/**
 * Privacy gate (ARCHITECTURE.md §8): any new dependency must be approved and added here
 * deliberately, together with an ARCHITECTURE.md update.
 */
const APPROVED_RUNTIME = new Set([
  // Expo SDK / template baseline
  'expo',
  'expo-constants',
  'expo-font',
  'expo-linking',
  'expo-router',
  'expo-splash-screen',
  'expo-status-bar',
  'expo-system-ui',
  'react',
  'react-native',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-screens',
  // Phase 1 native scrypt benchmark only; Noble remains the production implementation.
  'react-native-nitro-modules',
  'react-native-quick-base64',
  'react-native-quick-crypto',
  '@expo/vector-icons',
  // Approved in ARCHITECTURE.md §9
  'expo-sqlite',
  'expo-secure-store',
  'expo-local-authentication',
  'expo-crypto',
  'expo-file-system',
  'expo-sharing',
  'expo-document-picker',
  'expo-dev-client',
  'expo-localization',
  'expo-screen-capture',
  'intl-pluralrules',
  'i18next',
  'react-i18next',
  'react-native-paper',
  'react-native-gifted-charts',
  'react-native-svg',
  'expo-linear-gradient',
  '@react-native-community/datetimepicker',
  '@reduxjs/toolkit',
  'react-redux',
  '@noble/hashes',
  'zod',
]);

const APPROVED_DEV = new Set([
  '@testing-library/react-native',
  '@types/better-sqlite3',
  '@types/jest',
  '@types/react',
  'better-sqlite3',
  'eslint',
  'eslint-config-expo',
  'fast-check',
  'jest',
  'jest-expo',
  'typescript',
]);

const NEVER = [
  /^expo-updates$/,
  /^expo-network$/,
  /^expo-web-browser$/,
  /sentry/i,
  /firebase/i,
  /supabase/i,
  /analytics/i,
  /amplitude|mixpanel|segment/i,
];

describe('dependency allowlist', () => {
  const runtime = Object.keys(pkg.dependencies);
  const dev = Object.keys(pkg.devDependencies);

  it('has only approved runtime dependencies', () => {
    expect(runtime.filter((d) => !APPROVED_RUNTIME.has(d))).toEqual([]);
  });

  it('has only approved dev dependencies', () => {
    expect(dev.filter((d) => !APPROVED_DEV.has(d))).toEqual([]);
  });

  it('contains no banned network/analytics packages', () => {
    expect([...runtime, ...dev].filter((d) => NEVER.some((re) => re.test(d)))).toEqual([]);
  });
});
