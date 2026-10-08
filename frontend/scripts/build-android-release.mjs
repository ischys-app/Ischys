#!/usr/bin/env node
/**
 * Builds the signed Android App Bundle that Google Play takes.
 *
 * Run after `expo prebuild -p android`:
 *
 *     npx expo prebuild -p android
 *     npm run release:android
 *
 * It checks that the generated project carries the version in `app.json`, then
 * runs `bundleRelease` signed with the upload key named in the untracked
 * `signing.local.json`. `scripts/gradleRelease.js` explains how the key reaches
 * Gradle without being written into the project.
 *
 * Needs a JDK 17 on `JAVA_HOME` and the Android SDK on `ANDROID_HOME`.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { readVersion } = require('./gradleRelease.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const BUILD_GRADLE = path.join(ANDROID, 'app/build.gradle');
const SIGNING_FILE = path.join(ROOT, 'signing.local.json');
const BUNDLE = path.join(ANDROID, 'app/build/outputs/bundle/release/app-release.aab');

function fail(message, detail = []) {
  console.error(`\nbuild-android-release: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
}

const { expo } = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const version = expo.version;
const versionCode = expo.android?.versionCode;
if (!version || !versionCode) {
  fail('app.json needs expo.version and expo.android.versionCode');
}

if (!fs.existsSync(BUILD_GRADLE)) {
  fail(`no generated project at ${path.relative(ROOT, BUILD_GRADLE)}`, [
    'Run `npx expo prebuild -p android` first.',
  ]);
}
const gradle = fs.readFileSync(BUILD_GRADLE, 'utf8');
const generated = readVersion(gradle);
if (generated.versionName !== version || generated.versionCode !== String(versionCode)) {
  fail(`version mismatch against app.json (${version}, versionCode ${versionCode})`, [
    `android/app/build.gradle is at ${generated.versionName} (${generated.versionCode}).`,
    'Re-run `npx expo prebuild -p android` so the generated project picks up app.json.',
  ]);
}
if (!gradle.includes('ISCHYS_UPLOAD_STORE_FILE')) {
  fail('android/app/build.gradle has no release signing config', [
    'Re-run `npx expo prebuild -p android`; the signing plugin in app.json adds it.',
  ]);
}

let signing;
try {
  signing = JSON.parse(fs.readFileSync(SIGNING_FILE, 'utf8')).android;
} catch (cause) {
  fail(`cannot read signing.local.json: ${cause.message}`, [
    'Copy signing.local.example.json to signing.local.json and fill in `android`.',
  ]);
}
const missing = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].filter(
  (key) => !signing?.[key],
);
if (missing.length > 0) {
  fail(`signing.local.json is missing android.${missing.join(', android.')}`);
}
if (!fs.existsSync(signing.storeFile)) {
  fail(`upload keystore not found at ${signing.storeFile}`);
}

console.log(`build-android-release: ${version} (versionCode ${versionCode})`);

// Passed through the environment rather than as -P flags, so the passwords
// never appear in a process listing or a build scan.
const built = spawnSync('./gradlew', [':app:bundleRelease', ...process.argv.slice(2)], {
  cwd: ANDROID,
  stdio: 'inherit',
  env: {
    ...process.env,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_STORE_FILE: signing.storeFile,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_STORE_PASSWORD: signing.storePassword,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_KEY_ALIAS: signing.keyAlias,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_KEY_PASSWORD: signing.keyPassword,
  },
});
if (built.status !== 0) fail('gradle bundleRelease failed');

console.log(`build-android-release: ${path.relative(ROOT, BUNDLE)}`);
