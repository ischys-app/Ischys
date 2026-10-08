#!/usr/bin/env node
/**
 * Builds the signed App Bundle of the Wear OS companion that Google Play takes.
 *
 *     node wear/build-release.mjs
 *
 * The Watch app shares the phone app's applicationId and must be signed with
 * the same upload key, or the Wearable Data Layer will not connect the two.
 * So this reads the key from the same untracked `signing.local.json` that
 * `scripts/build-android-release.mjs` uses and hands it to Gradle the same
 * way. The version comes from `app.json` (see app/build.gradle.kts).
 *
 * Extra arguments replace the Gradle task, e.g. `:app:assembleRelease` for an
 * APK to sideload. Needs a JDK 17 on `JAVA_HOME` and the Android SDK on
 * `ANDROID_HOME`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WEAR = import.meta.dirname;
const ROOT = path.resolve(WEAR, '..');
const SIGNING_FILE = path.join(ROOT, 'signing.local.json');
const BUNDLE = path.join(WEAR, 'app/build/outputs/bundle/release/app-release.aab');

function fail(message, detail = []) {
  console.error(`\nwear/build-release: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
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

const tasks = process.argv.slice(2);
const bundling = tasks.length === 0;

// Passed through the environment rather than as -P flags, so the passwords
// never appear in a process listing or a build scan.
const built = spawnSync('./gradlew', bundling ? [':app:bundleRelease'] : tasks, {
  cwd: WEAR,
  stdio: 'inherit',
  env: {
    ...process.env,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_STORE_FILE: signing.storeFile,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_STORE_PASSWORD: signing.storePassword,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_KEY_ALIAS: signing.keyAlias,
    ORG_GRADLE_PROJECT_ISCHYS_UPLOAD_KEY_PASSWORD: signing.keyPassword,
  },
});
if (built.status !== 0) fail('gradle failed');

if (bundling) console.log(`wear/build-release: ${path.relative(ROOT, BUNDLE)}`);
