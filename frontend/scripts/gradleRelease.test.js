/** Run with: npm test */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { applyReleaseSigning, readVersion } = require('./gradleRelease.js');

/** The parts of the Expo template's app/build.gradle this touches. */
const TEMPLATE = `android {
    defaultConfig {
        applicationId 'app.ischys.mobile'
        versionCode 16
        versionName "4.2"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

test('the release build type takes the upload key when one is supplied', () => {
  const out = applyReleaseSigning(TEMPLATE);
  const release = out.slice(out.indexOf('buildTypes')).split('release {')[1];
  assert.match(release, /hasProperty\('ISCHYS_UPLOAD_STORE_FILE'\) \? signingConfigs\.release : signingConfigs\.debug/);
});

test('the debug build type keeps the debug key', () => {
  const out = applyReleaseSigning(TEMPLATE);
  const debug = out.slice(out.indexOf('buildTypes')).split('release {')[0];
  assert.match(debug, /signingConfig signingConfigs\.debug\n/);
  assert.doesNotMatch(debug, /ISCHYS_UPLOAD/);
});

test('a release signing config is declared beside the debug one', () => {
  const out = applyReleaseSigning(TEMPLATE);
  const configs = out.slice(out.indexOf('signingConfigs {'), out.indexOf('buildTypes'));
  assert.match(configs, /debug \{[^}]*\}\s*release \{/);
  assert.match(configs, /storeFile file\(project\.property\('ISCHYS_UPLOAD_STORE_FILE'\)\)/);
});

test('no secret is written into the project', () => {
  const out = applyReleaseSigning(TEMPLATE);
  assert.doesNotMatch(out, /storePassword '(?!android')/);
});

test('applying twice changes nothing', () => {
  const once = applyReleaseSigning(TEMPLATE);
  assert.equal(applyReleaseSigning(once), once);
});

test('a template that has lost its release build type is an error, not a silent debug-signed build', () => {
  assert.throws(() => applyReleaseSigning(TEMPLATE.replace('release {', 'staging {')), /release build type/);
  assert.throws(() => applyReleaseSigning('android {}'), /signingConfigs/);
});

test('reads the version the generated project declares', () => {
  assert.deepEqual(readVersion(TEMPLATE), { versionCode: '16', versionName: '4.2' });
});
