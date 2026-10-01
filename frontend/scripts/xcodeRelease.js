/**
 * Release-critical Xcode build settings, as pure functions over the object
 * `xcode`'s `pbxXCBuildConfigurationSection()` returns.
 *
 * Both halves exist because `expo prebuild` regenerates `ios/`, so nothing
 * hand-edited there survives.
 *
 * **Signing** has to be applied after a prebuild. The generated project pins
 * `CODE_SIGN_IDENTITY` to "iPhone Developer" at project level, so an archive
 * reaches for the Development key — which lives in the login keychain and is
 * unreachable over SSH — while forcing an identity on the command line instead
 * fails as "conflicting provisioning settings" so long as the style is
 * Automatic. `@bacons/apple-targets` leaves the watch and widget it generates
 * on `CODE_SIGN_STYLE = Automatic`, and a config plugin cannot fix that: the
 * standard `ios.xcodeproj` mod runs before those targets exist, and reaching
 * them would mean depending on that package's internal base mod. So this runs
 * as an explicit release step instead, and the identity and profile names —
 * which belong to one machine and one developer account — come from an
 * untracked file.
 *
 * **Versions** are only verified, not set. `apple-targets` already syncs
 * `MARKETING_VERSION` onto every native target from `expo.version` on each
 * prebuild, so setting it again here would just duplicate upstream behaviour
 * and rot. What actually goes wrong is skipping the prebuild: the watch app and
 * the widget set `GENERATE_INFOPLIST_FILE = YES`, so for them the build setting
 * wins and their committed `Info.plist` is ignored — bump `app.json`, edit the
 * plists, archive without prebuilding, and the app ships at the new version
 * with its extensions still on the old one. Apple rejects that, but only at
 * validation, after a full archive. Hence a cheap check up front.
 */

/** Reads a pbxproj value, which may or may not have arrived quoted. */
function unquote(value) {
  if (typeof value !== 'string') return value;
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

/**
 * Quotes a value only if pbxproj requires it. Versions and team ids stay bare
 * so a regenerated project diffs cleanly against the old one.
 */
function quoteIfNeeded(value) {
  const str = String(value);
  if (str.startsWith('"') && str.endsWith('"')) return str;
  return /^[A-Za-z0-9._/-]+$/.test(str) ? str : `"${str}"`;
}

/** The app itself, or one of its extensions — not an unrelated bundle that
 *  merely shares a prefix (`app.ischys.mobileevil`). */
function belongsToApp(bundleIdentifier, base) {
  if (!bundleIdentifier || !base) return false;
  return bundleIdentifier === base || bundleIdentifier.startsWith(`${base}.`);
}

/** Every real XCBuildConfiguration in the section, skipping `_comment` keys. */
function* configurations(section) {
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const entry = section[key];
    if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
    yield entry;
  }
}

/** The app and its extensions, paired with their bundle id. */
function appConfigurations(section, bundleIdentifier) {
  const found = [];
  for (const entry of configurations(section)) {
    const bundleId = unquote(entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER);
    if (!belongsToApp(bundleId, bundleIdentifier)) continue;
    found.push({ entry, bundleId });
  }
  return found;
}

/**
 * Whether this target's version comes from its build settings.
 *
 * With `GENERATE_INFOPLIST_FILE = YES` Xcode synthesises the version keys from
 * `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION`, overriding whatever the
 * target's own `Info.plist` says — true of the watch app and the widget. The
 * main app leaves it off, so its `Info.plist` is authoritative and these
 * settings are inert template defaults that never reach the binary.
 */
function generatesInfoPlist(entry) {
  return unquote(entry.buildSettings.GENERATE_INFOPLIST_FILE) === 'YES';
}

/**
 * Checks the version of every target that reads it from build settings.
 * Returns one readable line per disagreement, empty when they all match.
 *
 * The main app is deliberately not checked here; its `Info.plist` is the
 * source of truth and `prepare-ios-release.mjs` compares that file directly.
 */
function verifyVersions(section, { version, buildNumber, bundleIdentifier }) {
  const problems = [];
  for (const { entry, bundleId } of appConfigurations(section, bundleIdentifier)) {
    if (!generatesInfoPlist(entry)) continue;
    const where = `${bundleId} (${entry.name})`;
    const marketing = unquote(entry.buildSettings.MARKETING_VERSION);
    if (String(marketing) !== String(version)) {
      problems.push(`${where}: MARKETING_VERSION is ${marketing}, expected ${version}`);
    }
    if (buildNumber == null) continue;
    const current = unquote(entry.buildSettings.CURRENT_PROJECT_VERSION);
    if (String(current) !== String(buildNumber)) {
      problems.push(`${where}: CURRENT_PROJECT_VERSION is ${current}, expected ${buildNumber}`);
    }
  }
  return problems;
}

/** Both spellings of the project-level pin, since it arrives quoted. */
const DEVELOPER_PIN_KEYS = [
  'CODE_SIGN_IDENTITY[sdk=iphoneos*]',
  '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"',
];

/**
 * Switches the app and its extensions to manual signing for Release only —
 * Debug stays automatic so ordinary `expo run:ios` development is unaffected.
 *
 * Validates before it writes anything: a target signed with the wrong profile
 * produces an archive that fails at upload, which costs a full rebuild, so a
 * refusal here leaves the project exactly as it was.
 */
function applySigning(section, { identity, teamId, profiles, bundleIdentifier }) {
  const targets = appConfigurations(section, bundleIdentifier).filter(
    ({ entry }) => entry.name === 'Release',
  );

  const missing = targets.map((t) => t.bundleId).filter((id) => !profiles?.[id]);
  if (missing.length > 0) {
    throw new Error(
      `no provisioning profile configured for ${[...new Set(missing)].join(', ')}`,
    );
  }
  if (!identity) throw new Error('no signing identity configured');

  // The pin sits on the project-level configurations, which have no bundle id
  // of their own, so it is cleared across the whole section.
  for (const entry of configurations(section)) {
    for (const key of DEVELOPER_PIN_KEYS) delete entry.buildSettings[key];
  }

  for (const { entry, bundleId } of targets) {
    entry.buildSettings.CODE_SIGN_STYLE = 'Manual';
    entry.buildSettings.CODE_SIGN_IDENTITY = quoteIfNeeded(identity);
    entry.buildSettings.PROVISIONING_PROFILE_SPECIFIER = quoteIfNeeded(profiles[bundleId]);
    if (teamId) entry.buildSettings.DEVELOPMENT_TEAM = quoteIfNeeded(teamId);
  }

  return targets.map((t) => t.bundleId);
}

module.exports = {
  verifyVersions,
  applySigning,
  unquote,
  quoteIfNeeded,
  belongsToApp,
  generatesInfoPlist,
};
