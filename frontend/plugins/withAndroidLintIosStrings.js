/**
 * Keeps the iOS-only locale strings from failing the Android release build.
 * `scripts/gradleLint.js` explains why.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const { applyLintIgnores } = require('../scripts/gradleLint.js');

module.exports = function withAndroidLintIosStrings(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withAndroidLintIosStrings: expected a Groovy app/build.gradle');
    }
    mod.modResults.contents = applyLintIgnores(mod.modResults.contents);
    return mod;
  });
};
