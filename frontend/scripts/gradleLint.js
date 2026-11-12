/**
 * Lets the Android release build accept the iOS-only strings Expo writes.
 *
 * `expo.locales` (locales/<lang>.json) holds iOS permission texts such as
 * NSHealthShareUsageDescription. Expo also writes every entry into Android's
 * values-b+<lang>/strings.xml, with no default-locale copy, and lint's
 * ExtraTranslation check is fatal in a release build. Android never reads
 * these strings, so that one check is turned off, and only that one.
 */
const MARK = '// ischys: iOS-only locale strings';

function applyLintIgnores(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const anchor = /^android \{\n/m;
  if (!anchor.test(gradle)) throw new Error('gradleLint: no top-level `android {` block');
  return gradle.replace(
    anchor,
    `android {\n    ${MARK}\n    lint {\n        disable 'ExtraTranslation'\n    }\n`,
  );
}

module.exports = { applyLintIgnores };
