/**
 * Release signing for the generated `android/app/build.gradle`, as a pure
 * function over its text.
 *
 * `expo prebuild` regenerates `android/`, and the template signs the release
 * build type with the debug keystore — which Google Play refuses. So the
 * config plugin in `plugins/withAndroidReleaseSigning.js` rewrites the file on
 * every prebuild using this.
 *
 * The keystore path and passwords are never written into the project. Gradle
 * reads them as project properties, which `scripts/build-android-release.mjs`
 * supplies from the untracked `signing.local.json`. Without them the release
 * build type falls back to the debug key, so `expo run:android --variant
 * release` keeps working on a machine that has no upload key.
 */

const PROPERTY = 'ISCHYS_UPLOAD_STORE_FILE';

const RELEASE_SIGNING_CONFIG = `        release {
            if (project.hasProperty('${PROPERTY}')) {
                storeFile file(project.property('ISCHYS_UPLOAD_STORE_FILE'))
                storePassword project.property('ISCHYS_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('ISCHYS_UPLOAD_KEY_ALIAS')
                keyPassword project.property('ISCHYS_UPLOAD_KEY_PASSWORD')
            }
        }
`;

const RELEASE_SIGNING_CHOICE = `signingConfig project.hasProperty('${PROPERTY}') ? signingConfigs.release : signingConfigs.debug`;

/** Adds the `release` signing config and points the release build type at it. */
function applyReleaseSigning(gradle) {
  if (gradle.includes(PROPERTY)) return gradle; // already applied

  const configs = /( *signingConfigs\s*\{\s*\n\s*debug\s*\{[^}]*\}\s*\n)/;
  if (!configs.test(gradle)) {
    throw new Error('app/build.gradle has no signingConfigs { debug { … } } block to extend');
  }
  const withConfig = gradle.replace(configs, `$1${RELEASE_SIGNING_CONFIG}`);

  // The release build type is the `release {` that follows `buildTypes {`;
  // the debug one keeps its debug key.
  const buildType = /(buildTypes\s*\{[\s\S]*?\n\s*release\s*\{[^}]*?)signingConfig signingConfigs\.debug/;
  if (!buildType.test(withConfig)) {
    throw new Error('app/build.gradle has no release build type signed with signingConfigs.debug');
  }
  return withConfig.replace(buildType, `$1${RELEASE_SIGNING_CHOICE}`);
}

/** `versionCode` and `versionName` as the generated build.gradle declares them. */
function readVersion(gradle) {
  return {
    versionCode: gradle.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1],
    versionName: gradle.match(/^\s*versionName\s+"([^"]*)"\s*$/m)?.[1],
  };
}

module.exports = { applyReleaseSigning, readVersion };
