#!/usr/bin/env node
/**
 * Prepares a freshly prebuilt `ios/` for an App Store archive.
 *
 * Run after `expo prebuild -p ios` and before `xcodebuild archive`:
 *
 *     npx expo prebuild -p ios
 *     npm run release:ios
 *     xcodebuild -workspace ios/Ischys.xcworkspace -scheme Ischys \
 *       -configuration Release -destination generic/platform=iOS \
 *       -archivePath build/Ischys.xcarchive archive
 *
 * It checks that every target carries the version in `app.json` and switches
 * the app, the watch app and the widget to manual distribution signing.
 * `scripts/xcodeRelease.js` explains why each of those is necessary.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const xcode = require('xcode');
const { applySigning, verifyVersions } = require('./xcodeRelease.js');

const ROOT = path.resolve(import.meta.dirname, '..');
const PBXPROJ = path.join(ROOT, 'ios/Ischys.xcodeproj/project.pbxproj');
const APP_PLIST = path.join(ROOT, 'ios/Ischys/Info.plist');
const SIGNING_FILE = path.join(ROOT, 'signing.local.json');

function fail(message, detail = []) {
  console.error(`\nprepare-ios-release: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
}

function plistValue(file, key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return undefined;
  }
}

const { expo } = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const version = expo.version;
const buildNumber = expo.ios?.buildNumber;
const bundleIdentifier = expo.ios?.bundleIdentifier;
if (!version || !buildNumber || !bundleIdentifier) {
  fail('app.json needs expo.version, expo.ios.buildNumber and expo.ios.bundleIdentifier');
}

if (!fs.existsSync(PBXPROJ)) {
  fail(`no generated project at ${path.relative(ROOT, PBXPROJ)}`, [
    'Run `npx expo prebuild -p ios` first.',
  ]);
}

if (!fs.existsSync(SIGNING_FILE)) {
  fail('signing.local.json is missing', [
    'Copy signing.local.example.json to signing.local.json and fill in the',
    'distribution identity and the profile name for each bundle id. The file is',
    'untracked because those are specific to one machine and developer account.',
  ]);
}
let signing;
try {
  signing = JSON.parse(fs.readFileSync(SIGNING_FILE, 'utf8'));
} catch (cause) {
  fail(`signing.local.json is not valid JSON: ${cause.message}`);
}

const project = xcode.project(PBXPROJ);
project.parseSync();
const section = project.pbxXCBuildConfigurationSection();

// Verify before writing, so a mismatch leaves the project untouched.
const problems = verifyVersions(section, { version, buildNumber, bundleIdentifier });

// The main app reads its own Info.plist rather than MARKETING_VERSION, so that
// file is checked separately — it is the one the App Store actually sees.
const plistVersion = plistValue(APP_PLIST, 'CFBundleShortVersionString');
const plistBuild = plistValue(APP_PLIST, 'CFBundleVersion');
if (plistVersion !== version) {
  problems.push(`ios/Ischys/Info.plist: CFBundleShortVersionString is ${plistVersion}, expected ${version}`);
}
if (plistBuild !== String(buildNumber)) {
  problems.push(`ios/Ischys/Info.plist: CFBundleVersion is ${plistBuild}, expected ${buildNumber}`);
}

if (problems.length > 0) {
  fail(`version mismatch against app.json (${version}, build ${buildNumber})`, [
    ...problems,
    '',
    'Apple rejects an upload whose extension version differs from the host app,',
    'and only reports it at validation. Re-run `npx expo prebuild -p ios` so the',
    'generated project picks up app.json.',
  ]);
}
console.log(`prepare-ios-release: all targets at ${version} (build ${buildNumber})`);

let signed;
try {
  signed = applySigning(section, {
    identity: signing.identity,
    teamId: signing.teamId ?? expo.ios?.appleTeamId,
    profiles: signing.profiles,
    bundleIdentifier,
  });
} catch (cause) {
  fail(cause.message, ['Add the missing entry to signing.local.json.']);
}

fs.writeFileSync(PBXPROJ, project.writeSync());
console.log(`prepare-ios-release: manual Release signing for ${signed.join(', ')}`);
console.log(`prepare-ios-release: identity ${signing.identity}`);
