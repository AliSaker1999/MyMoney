// Expo config plugin: sign release builds with the owner's upload key instead of the shared
// debug keystore that the Expo/React Native template uses.
//
// The key never lives in the repo. Its location and passwords come from Gradle properties,
// normally kept in %USERPROFILE%\.gradle\gradle.properties (outside the project):
//
//   MYMONEY_UPLOAD_STORE_FILE=C:\\Users\\you\\.mymoney-signing\\mymoney-upload.jks
//   MYMONEY_UPLOAD_STORE_PASSWORD=...
//   MYMONEY_UPLOAD_KEY_ALIAS=mymoney-upload
//   MYMONEY_UPLOAD_KEY_PASSWORD=...
//
// Without those properties a release build falls back to debug signing so local test builds
// still work, and scripts/verify-release.mjs then rejects the APK as not shippable.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// mymoney-release-signing';

const RELEASE_SIGNING_CONFIG = `
        release { ${MARKER}
            if (project.hasProperty('MYMONEY_UPLOAD_STORE_FILE')) {
                storeFile file(project.property('MYMONEY_UPLOAD_STORE_FILE'))
                storePassword project.property('MYMONEY_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('MYMONEY_UPLOAD_KEY_ALIAS')
                keyPassword project.property('MYMONEY_UPLOAD_KEY_PASSWORD')
            }
        }`;

function applyReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const signingBlock = /signingConfigs\s*\{\s*\n(\s*)debug\s*\{[^}]*\}/m;
  if (!signingBlock.test(gradle)) {
    throw new Error('withReleaseSigning: could not find signingConfigs.debug in app/build.gradle');
  }
  let next = gradle.replace(signingBlock, (match) => `${match}${RELEASE_SIGNING_CONFIG}`);

  const releaseUsesDebug =
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/m;
  if (!releaseUsesDebug.test(next)) {
    throw new Error('withReleaseSigning: could not find the release signingConfig in app/build.gradle');
  }
  next = next.replace(
    releaseUsesDebug,
    "$1signingConfig project.hasProperty('MYMONEY_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
  );
  return next;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: only Groovy app/build.gradle is supported');
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
