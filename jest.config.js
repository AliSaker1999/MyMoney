/**
 * Two Jest projects:
 *  - rn:   React Native components and hooks (jest-expo preset). Files: *.test.ts(x) under src/.
 *  - node: pure logic, SQL and migrations against better-sqlite3, and crypto vectors.
 *          Files: tests/**\/*.node.test.ts.
 */
const moduleNameMapper = { '^@/(.*)$': '<rootDir>/src/$1' };

// jest-expo's default list, plus ESM-only packages (@noble/*, react-native-paper's deps, gifted-charts).
const transformIgnorePatterns = [
  '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@noble|react-native-paper|react-native-gifted-charts|gifted-charts-core))',
];

module.exports = {
  projects: [
    {
      displayName: 'rn',
      preset: 'jest-expo/android',
      testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
      moduleNameMapper,
      transformIgnorePatterns,
    },
    {
      displayName: 'node',
      preset: 'jest-expo/node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.node.test.ts'],
      moduleNameMapper,
      transformIgnorePatterns,
    },
  ],
};
