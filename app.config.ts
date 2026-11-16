import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * APP_VARIANT
 *  - "development" (default): dev-client builds; Metro needs network access.
 *  - "production": release builds. Network and storage permissions are stripped
 *    and the release is checked by scripts/verify-release.mjs.
 */
const variant = process.env.APP_VARIANT === 'production' ? 'production' : 'development';
const isProduction = variant === 'production';

// Provisional application id. Confirm before the first Play Store upload (it cannot change afterwards).
const APP_ID = 'app.mymoney';

/** Permissions that must never appear in a release build. */
const BLOCKED_IN_PRODUCTION = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.VIBRATE',
  // expo-screen-capture declares these for its screenshot *listener*, which we don't use.
  // FLAG_SECURE (preventScreenCaptureAsync) does not need them.
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.DETECT_SCREEN_CAPTURE',
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'My Money',
  slug: 'mymoney',
  version: '0.1.0',
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
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
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
        backgroundColor: '#208AEF',
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
