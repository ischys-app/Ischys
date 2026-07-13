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

## Two invariants that fail silently

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
