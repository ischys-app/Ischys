# Testing Ischys

Runbook to exercise the full app end-to-end. Ischys runs **entirely on-device** —
there is no backend to stand up.

## Unit tests + typecheck

```bash
cd frontend
npm install                 # frontend/.npmrc sets legacy-peer-deps; see the note there
npm run typecheck           # tsc --noEmit
npm test                    # node --test over src/**/*.test.ts (also runs lint:la)
TZ=Europe/Athens npm test   # timestamp math is timezone-sensitive — see CONTRIBUTING
```

Tests are pure logic (stats, records, streaks, CSV parsing, watch-state, …). There is
no bundler, no DOM, and no API mock — the data/repository layer (SQLite) is exercised on
a device, not in the suite. See CONTRIBUTING for why.

## Build & run on a device

```bash
cd frontend
npx expo run:ios                          # debug dev client (needs Metro running)
npx expo run:ios --configuration Release  # standalone build, JS embedded, no Metro
```

- First run is slow (prebuild + CocoaPods).
- A **Release** build embeds the JS bundle and needs no packager — use it to test the app
  untethered (e.g. at the gym). A **debug** build must reach Metro on your Mac.
- **Do not use Expo Go.** `react-native-view-shot` ships native iOS code Expo Go does not
  bundle and is imported statically by `app/summary/[id].tsx`, so a core screen breaks. Expo
  Go also pins one SDK per release and refuses an SDK 57 project. Use `expo run:ios` (Xcode +
  CocoaPods on macOS) or `eas build --profile development`.

After changing native config in `app.json`, regenerate `ios/` — `expo run:ios` reuses an
existing one and won't update `Info.plist`:

```bash
rm -rf ios && npx expo run:ios
```

## Test flows

### 1. First run
- App opens straight to **Home** (no sign-in, no server to connect). Empty state until the
  first workout.

### 2. Core loop
- Home **Start Empty Workout** → creates a workout → Active Workout (empty).
- **+ Add Exercise** → Exercise Library modal → filter/search → select ≥1 → **Add N** → back
  with the exercises added.
- Log a set:
  - Tap the set-type **badge** to cycle Normal → Warmup → Drop → Failure.
  - Tap **PREV** to autofill weight/reps from last session.
  - Type weight + reps → tap the **accent checkmark** to complete (starts the rest timer).
- Rest timer bar: ±15s, **Skip**; per-exercise **Rest Timer** row opens the picker sheet.
- **Finish** → Workout Summary (volume, PRs, exercises, volume-by-muscle).
- **Done** → Home. **Save as Routine** → creates a routine from this workout.

Persistence check: add sets, then force-quit and reopen — the workout and its sets survive
(SQLite is the source of truth).

### 3. Routines
- Home **My Routines → New** → Routine Builder. Set title, **+ Add Exercise**, add sets /
  target weights / per-exercise rest → **Save**.
- Home **Start Routine** → Active Workout prefilled from the routine (and from your *last*
  session of each exercise, for progressive overload).

### 4. History / Exercise Detail / Profile / Settings
- **History tab** → 12-week accent heatmap + grouped workout cards (`THIS WEEK` / `LAST WEEK`
  / `MMM YYYY`). Tap a workout → its Summary.
- **Exercise Detail** → About / History / Charts. Charts need ≥2 completed sessions of that
  exercise ("Not enough data yet" with one). A demo URL can be pasted (http(s) only).
- **Profile tab** → identity, 2×2 stats grid, weekly YTD bars, recent PRs.
- Top-right gear → **Settings** (unit, timer/haptic toggles, export, import).

### 5. Export / Import / Health
- Settings → **Export** writes a JSON or workout CSV of your history.
- Settings → **Import** picks a workout CSV and creates completed workouts locally. Re-importing
  the same file is idempotent — already-imported workouts (keyed by name + start time) are
  skipped and reported.
- **Apple Health** (macOS + dev build + HealthKit entitlements): finished workouts are written
  as `HKWorkout`; heart rate is read live from a recording Apple Watch.

### 6. Editing a live workout
- **Delete a set** — long-press a set's type badge → confirm. Remaining sets renumber so PREV
  autofill stays aligned.
- **Reorder / remove an exercise** — the "⋯" menu: Move up / Move down / Remove.
- **Discard** — trash icon in the header, left of Finish.

## Apple Watch + Live Activity

These need a **physical device** (the simulator will not do) and are the most fiddly to test.

- **Live Activity:** an in-flight activity keeps rendering the widget code it started with —
  installing a new build does not re-render a running card. End the activity and force-quit
  before testing, or you're looking at stale UI. A crash in the intent path is invisible
  (behind the Lock Screen); reproduce the suspect call in a standalone `swiftc -O` binary and
  check the exit code before another device round-trip (`134` = `SIGABRT`).
- **Watch companion:** start a workout with Health connected and HR reading on — the Watch app
  launches, flips to the live session, and streams HR back. End / Pause / Discard / Add / log
  set all work from the wrist and stay in sync with the phone. A session orphaned by a rebuild
  is discarded automatically on the next Watch app launch.

## Known gaps (deferred)

- Drag-to-reorder and swipe-to-delete gestures (needs `react-native-gesture-handler` +
  `reanimated`). Today: long-press to delete a set, menu items to move exercises.
- Routine reordering on Home still shows "Coming soon".
- Social / sharing beyond the export card is a future PR.
