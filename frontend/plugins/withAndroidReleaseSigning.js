/**
 * Signs the Android release build with the upload key when one is supplied.
 * `scripts/gradleRelease.js` explains what it changes and why.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const { applyReleaseSigning } = require('../scripts/gradleRelease.js');

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('withAndroidReleaseSigning: expected a Groovy app/build.gradle');
    }
    mod.modResults.contents = applyReleaseSigning(mod.modResults.contents);
    return mod;
  });
};
