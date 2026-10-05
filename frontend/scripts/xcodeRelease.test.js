/** Run with: npm test */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  verifyVersions,
  applySigning,
  unquote,
  quoteIfNeeded,
} = require('./xcodeRelease.js');

const BUNDLE = 'app.ischys.mobile';

/**
 * The shape `xcode`'s `pbxXCBuildConfigurationSection()` hands back: every
 * entry is shadowed by a `<key>_comment` string, which is why the real bug
 * surface here is traversal rather than arithmetic.
 */
function section({ watchVersion = '4.1' } = {}) {
  return {
    AAA1: {
      isa: 'XCBuildConfiguration',
      name: 'Debug',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: BUNDLE,
        MARKETING_VERSION: '4.1',
        CURRENT_PROJECT_VERSION: '10',
      },
    },
    AAA1_comment: 'Debug',
    AAA2: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: BUNDLE,
        MARKETING_VERSION: '4.1',
        CURRENT_PROJECT_VERSION: '10',
      },
    },
    AAA2_comment: 'Release',
    // Generated targets arrive quoted, and set GENERATE_INFOPLIST_FILE — which
    // is what makes their build settings, not their Info.plist, authoritative.
    WATCH1: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: `"${BUNDLE}.watch"`,
        GENERATE_INFOPLIST_FILE: 'YES',
        MARKETING_VERSION: watchVersion,
        CURRENT_PROJECT_VERSION: '10',
      },
    },
    WATCH1_comment: 'Release',
    WIDGET1: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: `"${BUNDLE}.widget"`,
        GENERATE_INFOPLIST_FILE: 'YES',
        MARKETING_VERSION: '4.1',
        CURRENT_PROJECT_VERSION: '10',
      },
    },
    WIDGET1_comment: 'Release',
    // Project-level configuration: no bundle id, and the pin that made Xcode
    // reach for the Development key.
    PROJ1: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: { '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"': '"iPhone Developer"' },
    },
    PROJ1_comment: 'Release',
    // A different app entirely (a Pod, say) must be left alone.
    OTHER1: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'com.example.unrelated' },
    },
    OTHER1_comment: 'Release',
  };
}

// --- helpers ---

test('reads pbxproj values whether or not they are quoted', () => {
  assert.equal(unquote('"app.ischys.mobile"'), 'app.ischys.mobile');
  assert.equal(unquote('app.ischys.mobile'), 'app.ischys.mobile');
  assert.equal(unquote(undefined), undefined);
});

test('quotes only values that need it, so diffs stay small', () => {
  assert.equal(quoteIfNeeded('4.1'), '4.1');
  assert.equal(quoteIfNeeded('10'), '10');
  assert.equal(quoteIfNeeded('Ischys AppStore'), '"Ischys AppStore"');
  assert.equal(quoteIfNeeded('Apple Distribution: NAME (TEAM)'), '"Apple Distribution: NAME (TEAM)"');
  // Already quoted stays as-is rather than getting a second pair.
  assert.equal(quoteIfNeeded('"Ischys AppStore"'), '"Ischys AppStore"');
});

// --- verifyVersions ---
//
// Apple rejects an upload whose extension CFBundleShortVersionString differs
// from the host app, and only says so at validation — after a full archive.
// These checks are the cheap version of that feedback.

test('passes when every target agrees with the app config', () => {
  const problems = verifyVersions(section(), {
    version: '4.1',
    buildNumber: '10',
    bundleIdentifier: BUNDLE,
  });
  assert.deepEqual(problems, []);
});

test('catches an extension left behind on the previous version', () => {
  const problems = verifyVersions(section({ watchVersion: '4.0' }), {
    version: '4.1',
    buildNumber: '10',
    bundleIdentifier: BUNDLE,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /app\.ischys\.mobile\.watch \(Release\)/);
  assert.match(problems[0], /MARKETING_VERSION/);
  assert.match(problems[0], /4\.0.*4\.1|4\.1.*4\.0/);
});

test('reads quoted versions without reporting a false mismatch', () => {
  const s = section();
  s.WATCH1.buildSettings.MARKETING_VERSION = '"4.1"';
  assert.deepEqual(
    verifyVersions(s, { version: '4.1', buildNumber: '10', bundleIdentifier: BUNDLE }),
    [],
  );
});

test('catches a stale build number', () => {
  const s = section();
  s.WIDGET1.buildSettings.CURRENT_PROJECT_VERSION = '9';
  const problems = verifyVersions(s, {
    version: '4.1',
    buildNumber: '10',
    bundleIdentifier: BUNDLE,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /CURRENT_PROJECT_VERSION/);
});

test('treats a numeric build number the same as its string spelling', () => {
  const s = section();
  s.WIDGET1.buildSettings.CURRENT_PROJECT_VERSION = 10;
  assert.deepEqual(
    verifyVersions(s, { version: '4.1', buildNumber: 10, bundleIdentifier: BUNDLE }),
    [],
  );
});

test('reports a target that carries no version at all', () => {
  const s = section();
  delete s.WATCH1.buildSettings.MARKETING_VERSION;
  const problems = verifyVersions(s, {
    version: '4.1',
    buildNumber: '10',
    bundleIdentifier: BUNDLE,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /undefined/);
});

test('ignores the main app, whose own Info.plist overrides these settings', () => {
  const s = section();
  // Exactly what a fresh prebuild leaves on the main target: the Expo template
  // defaults, which never reach the binary.
  s.AAA2.buildSettings.MARKETING_VERSION = '1.0';
  s.AAA2.buildSettings.CURRENT_PROJECT_VERSION = 1;
  assert.deepEqual(
    verifyVersions(s, { version: '4.1', buildNumber: '10', bundleIdentifier: BUNDLE }),
    [],
  );
});

test('checks a target whose Info.plist is generated, since there the setting wins', () => {
  const s = section();
  s.WATCH1.buildSettings.GENERATE_INFOPLIST_FILE = '"YES"';
  s.WATCH1.buildSettings.MARKETING_VERSION = '4.0';
  const problems = verifyVersions(s, {
    version: '4.1',
    buildNumber: '10',
    bundleIdentifier: BUNDLE,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /watch/);
});

test('ignores bundles that are not ours, and configurations without one', () => {
  const s = section();
  s.OTHER1.buildSettings.MARKETING_VERSION = '0.1';
  assert.deepEqual(
    verifyVersions(s, { version: '4.1', buildNumber: '10', bundleIdentifier: BUNDLE }),
    [],
  );
});

test('a bundle id that merely starts with the same text is not an extension', () => {
  const s = {
    LOOKALIKE: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: `${BUNDLE}evil`, MARKETING_VERSION: '0.1' },
    },
  };
  assert.deepEqual(
    verifyVersions(s, { version: '4.1', buildNumber: '10', bundleIdentifier: BUNDLE }),
    [],
  );
});

test('skips comment keys rather than crashing on them', () => {
  const s = section();
  assert.doesNotThrow(() =>
    verifyVersions(s, { version: '4.1', buildNumber: '10', bundleIdentifier: BUNDLE }),
  );
  assert.equal(s.AAA1_comment, 'Debug');
});

// --- applySigning ---

const SIGNING = {
  identity: 'Apple Distribution: NAME (TEAM)',
  teamId: 'TEAM',
  profiles: {
    [BUNDLE]: 'Ischys AppStore',
    [`${BUNDLE}.watch`]: 'Ischys Watch AppStore',
    [`${BUNDLE}.widget`]: 'Ischys Widget AppStore',
  },
};

test('switches our targets to manual signing with their own profile', () => {
  const s = section();
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.equal(s.AAA2.buildSettings.CODE_SIGN_STYLE, 'Manual');
  assert.equal(s.AAA2.buildSettings.CODE_SIGN_IDENTITY, '"Apple Distribution: NAME (TEAM)"');
  assert.equal(s.AAA2.buildSettings.PROVISIONING_PROFILE_SPECIFIER, '"Ischys AppStore"');
  assert.equal(s.AAA2.buildSettings.DEVELOPMENT_TEAM, 'TEAM');
  assert.equal(s.WATCH1.buildSettings.PROVISIONING_PROFILE_SPECIFIER, '"Ischys Watch AppStore"');
  assert.equal(s.WIDGET1.buildSettings.PROVISIONING_PROFILE_SPECIFIER, '"Ischys Widget AppStore"');
});

test('covers the watch and widget, which is the whole point', () => {
  const s = section();
  const signed = applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.deepEqual(signed.sort(), [BUNDLE, `${BUNDLE}.watch`, `${BUNDLE}.widget`].sort());
  assert.equal(s.WATCH1.buildSettings.CODE_SIGN_STYLE, 'Manual');
  assert.equal(s.WIDGET1.buildSettings.CODE_SIGN_STYLE, 'Manual');
});

test('overwrites the Automatic style that the target generator leaves behind', () => {
  const s = section();
  s.WATCH1.buildSettings.CODE_SIGN_STYLE = 'Automatic';
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.equal(s.WATCH1.buildSettings.CODE_SIGN_STYLE, 'Manual');
});

test('leaves Debug on automatic signing, so day-to-day builds still work', () => {
  const s = section();
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.equal(s.AAA1.buildSettings.CODE_SIGN_STYLE, undefined);
  assert.equal(s.AAA1.buildSettings.PROVISIONING_PROFILE_SPECIFIER, undefined);
});

test('drops the project-level "iPhone Developer" pin that defeats a distribution identity', () => {
  const s = section();
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.equal(s.PROJ1.buildSettings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'], undefined);
});

test('removes the pin in its unquoted spelling too', () => {
  const s = {
    PROJ: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: { 'CODE_SIGN_IDENTITY[sdk=iphoneos*]': 'iPhone Developer' },
    },
  };
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.equal(s.PROJ.buildSettings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'], undefined);
});

test('a target with no configured profile is refused rather than signed wrongly', () => {
  const s = section();
  assert.throws(
    () =>
      applySigning(s, {
        ...SIGNING,
        profiles: { [BUNDLE]: 'Ischys AppStore' },
        bundleIdentifier: BUNDLE,
      }),
    /no provisioning profile configured for/,
  );
});

test('refusing to sign changes nothing at all', () => {
  const s = section();
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  const signed = JSON.stringify(s);

  const fresh = section();
  try {
    applySigning(fresh, { ...SIGNING, profiles: {}, bundleIdentifier: BUNDLE });
  } catch {
    // expected
  }
  assert.notEqual(JSON.stringify(fresh), signed);
  // The pin survives a refusal, proving nothing was half-applied.
  assert.equal(fresh.PROJ1.buildSettings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'], '"iPhone Developer"');
});

test('does not touch other apps', () => {
  const s = section();
  applySigning(s, { ...SIGNING, bundleIdentifier: BUNDLE });
  assert.equal(s.OTHER1.buildSettings.CODE_SIGN_STYLE, undefined);
});
