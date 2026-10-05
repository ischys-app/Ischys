# Contributing

Thanks for looking. This file covers the things that are not obvious from the code.

## Checks

Everything CI runs, you can run:

```bash
cd frontend
npm ci
npm run lint:la      # Live Activity shared-source guard (see below)
npx tsc --noEmit
npm test             # also runs lint:la
TZ=Europe/Athens npm test   # timestamps are timezone-sensitive; see below
```

There is no backend — the app runs entirely on-device (SQLite + Drizzle). The
whole suite is `frontend`.

## Four invariants that fail silently

**1. The widget and the app compile the *same* Swift source.**

`frontend/targets/ischys-widget/` contains three symlinks into
`frontend/modules/live-activity/ios/`:

- `WorkoutAttributes.swift`
- `LiveActivityActions.swift`
- `WorkoutIntents.swift`

ActivityKit matches an Activity by its attribute type name and `Codable` shape, and
`LiveActivityIntent` matches by type name. If those files ever become two diverging
copies, the Lock Screen card — or its buttons — stop working with **no crash and no log**.

Do not `cp` over a symlink. `npm run lint:la` fails if you do. (An earlier version of that
check compared two real copies with `cmp`; it passed happily when a bad `cp` reverted a
change in *both*. It proved they matched, never that they were right.)

**2. Timestamps are UTC; elapsed-time math is timezone-sensitive.**

The data layer stores epoch milliseconds and surfaces them as ISO-8601 with a `Z`
(`new Date(ms).toISOString()`). Parse those back with `src/lib/serverTime.ts`
(`parseServerDate` / `secondsSince`), never with `Date.parse` or `new Date(iso)`
directly: `parseServerDate` treats an offset-less string as UTC (so legacy or
imported data with no `Z` still reads correctly) and leaves an explicit offset
alone. `secondsSince` drives the live workout / rest clocks.

Run the test suite in a non-UTC timezone (`TZ=Europe/Athens npm test`). In UTC, a
naive-vs-local bug is invisible.

**3. `frontend/ios/` is generated, and the release version lives in `app.json` only.**

`ios/` is gitignored and rebuilt by `expo prebuild`. Nothing edited there survives, so a
release is cut by bumping `app.json` and prebuilding — never by editing the Xcode project
or a target `Info.plist`.

The trap is that the three targets read their version from two different places. The main
app uses `ios/Ischys/Info.plist`, which Expo writes from `app.json`. The watch app and the
widget set `GENERATE_INFOPLIST_FILE = YES`, so Xcode synthesises their version keys from
the `MARKETING_VERSION` build setting and **ignores** `targets/ischys-*/Info.plist`
entirely — which is why those files no longer carry version keys at all. On a prebuild,
`@bacons/apple-targets` syncs `MARKETING_VERSION` onto every target from `app.json`; skip
the prebuild and the app ships at the new version with its extensions still on the old one.
Apple rejects that, but only at validation, after a full archive.

So, to cut a release:

```bash
cd frontend
# bump expo.version and expo.ios.buildNumber in app.json, then:
npx expo prebuild -p ios
npm run release:ios     # checks every target's version, applies manual signing
xcodebuild -workspace ios/Ischys.xcworkspace -scheme Ischys -configuration Release \
  -destination generic/platform=iOS -archivePath build/Ischys.xcarchive archive
```

`npm run release:ios` fails loudly on any target that disagrees with `app.json`, which is
the cheap version of the feedback Apple would otherwise give you an archive later. It also
switches the Release configurations to manual distribution signing, because the generated
project pins `CODE_SIGN_IDENTITY` to "iPhone Developer" at project level and leaves the
generated targets on automatic signing — an archive then reaches for a Development key,
which fails outright over SSH, where the login keychain cannot be unlocked. This cannot be
a config plugin: the standard `ios.xcodeproj` mod runs before the watch and widget targets
exist. Signing needs an untracked `frontend/signing.local.json` (copy
`signing.local.example.json`); without it the script tells you what to write, and ordinary
development is unaffected since Debug stays on automatic signing.

**4. `db.transaction(async …)` is not a transaction.**

The expo-sqlite driver is synchronous: it commits the moment the callback returns, which
for an `async` callback is at its first `await`, so every later statement commits on its
own and a crash or a throw halfway leaves the write half-stored. Use `atomically` from
`frontend/src/db/client.ts` for any write of more than one statement (`npm test` fails on a
new `.transaction(async`). Its body may await nothing but database statements — read
SecureStore and files before it — and must not call a function that opens a transaction
of its own; hand that helper the open `tx` instead (`frontend/src/db/atomic.ts` has the why).

## Tests are pure

Everything under `frontend/src/**/*.test.ts` runs under `node --test` with type stripping.
There is no bundler, no DOM, and no API mock. Tested modules are therefore **self-contained**
— they import nothing, or only other pure modules, and they take their dependencies as
parameters (see `buildLiveActivityState`, which is handed the carry-forward rule rather than
importing it).

If you need to test something that does IO, the honest answer today is that you cannot, and
the missing piece is an API mock harness. Do not smuggle `fetch` into the suite.

Node's ESM loader needs the explicit extension: `import { x } from './y.ts'`.

## Live Activity changes need a physical device

- The simulator will not do. `devicectl` cannot launch the app on a locked phone, nor tap.
- **An in-flight Live Activity keeps rendering the widget code it started with.** Installing
  a new build does not re-render a running card. End the activity and force-quit the app
  before testing, or you are looking at stale UI.
- A crash in the intent path is invisible — it happens behind the Lock Screen, and reads as
  "the app minimised itself" or "the button does nothing". Suspect a crash before logic.
  Reproducing the suspect call in a standalone `swiftc -O` binary and checking the exit code
  is faster than another device round-trip. (`134` is `SIGABRT`.)

## Commits

Conventional-ish prefixes (`feat:`, `fix:`, `test:`, `docs:`). Say what broke and why the
fix is the fix; a commit that says "fix bug" costs the next person an afternoon.
