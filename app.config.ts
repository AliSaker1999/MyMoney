import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * APP_VARIANT
 *  - "development" (default): dev-client builds; Metro needs network access.
 *  - "production": release builds. Network and storage permissions are stripped
 *    and the release is checked by scripts/verify-release.mjs.
 */
const variant = process.env.APP_VARIANT === 'production' ? 'production' : 'development';
const isProduction = variant === 'production';

// Permanent application id (owner-confirmed 2026-11-24). Never change it: installs and data are tied to it.
const APP_ID = 'com.alisaker.mymoney';

/** Permissions that must never appear in a release build. */
const BLOCKED_IN_PRODUCTION = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.VIBRATE',
  // The screenshot listener does not use broad media access. Android requires
  // DETECT_SCREEN_CAPTURE to register the callback when expo-screen-capture loads.
  'android.permission.READ_MEDIA_IMAGES',
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'My Money',
  slug: 'mymoney',
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mymoney',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    icon: './assets/expo.icon',
  },
  android: {
    package: APP_ID,
    // Must increase with every release that users can install over an earlier one.
    versionCode: 2,
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#0C3B31',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(isProduction ? { blockedPermissions: BLOCKED_IN_PRODUCTION } : {}),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0C3B31',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    ['expo-sqlite', { useSQLCipher: true }],
    // Our own privacy plugin writes the backup rules, so secure-store must not add its own.
    ['expo-secure-store', { configureAndroidBackup: false }],
    ['expo-local-authentication', { faceIDPermission: 'Unlock My Money with Face ID.' }],
    ['expo-localization', { supportsRTL: true }],
    '@react-native-community/datetimepicker',
    // Must run after expo-secure-store.
    './plugins/withAndroidPrivacy',
    // Signs release builds with the owner's upload key (kept outside the repo).
    './plugins/withReleaseSigning',
  ],
  extra: {
    appVariant: variant,
    supportsRTL: true,
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
