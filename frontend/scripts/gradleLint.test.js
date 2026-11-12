/** Run with: npm test */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { applyLintIgnores } = require('./gradleLint.js');

const TEMPLATE = `apply plugin: "com.android.application"

android {
    ndkVersion rootProject.ext.ndkVersion
}
`;

test('turns off only ExtraTranslation, inside the android block', () => {
  const out = applyLintIgnores(TEMPLATE);
  assert.match(out, /android \{\n    \/\/ ischys: iOS-only locale strings\n    lint \{\n        disable 'ExtraTranslation'\n    \}\n    ndkVersion/);
  assert.equal(out.match(/disable/g).length, 1);
});

test('is idempotent', () => {
  const once = applyLintIgnores(TEMPLATE);
  assert.equal(applyLintIgnores(once), once);
});

test('fails loudly when the template has no android block', () => {
  assert.throws(() => applyLintIgnores('dependencies {\n}\n'), /no top-level `android \{` block/);
});
