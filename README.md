# Ischys · ΙΣΧΥΣ

**A private, on-device workout tracker.** _Ischys_ (ἰσχύς) is Ancient Greek for
*strength*. Your entire training log lives on **your phone** — no account, no
server, no cloud. Nothing ever leaves the device.

**[⬇︎ Download on the App Store](https://apps.apple.com/app/id6790443643)** ·
free · iPhone. Or [build it from source](#build--run) — it's open, MIT-licensed,
and the whole thing runs on-device either way.

**Android and Wear OS:** the app now runs there too. It is in closed testing on
Google Play and not publicly listed yet — coming soon. See
[Platform support](#platform-support).

The design is a precision instrument: monochrome, near-black, sharp, and legible
mid-set with sweaty hands. Big number targets, previous-session references one
tap away, and the accent colour reserved for a single action — completing a set.

---

## What it is

- **100% on-device.** Install and start tracking immediately. No sign-up, no
  backend to run. The app is a self-contained React Native / Expo app with a
  local SQLite database and all the training logic (volume, estimated 1RM, PR
  detection, streaks, charts) running in TypeScript on the phone.
- **Private by construction.** Because there is no server, your data can't be
  collected, sold, or breached. It backs up with your normal device backup
  (iCloud on iPhone, Google's device backup on Android), and you can **export**
  a JSON/CSV copy anytime.
- **Yours to build.** MIT-licensed. Clone it, build it, run it, change it.

## Features

- Log workouts (weight × reps), warmup / drop / failure set types, rest timer.
- **Routines** — build them, start a session that prefills from your *last*
  session (progressive overload), save a finished workout as a routine.
- **Personal records** (best set, est. 1RM, best volume, max reps) detected on
  finish, with per-exercise **history** and **charts**.
- **Profile** stats — workouts, volume lifted, weekly training bars, streaks.
- **Apple Watch** companion (mirror + control a live workout), **Live Activity**
  on the Lock Screen, and **Apple Health** (heart-rate read, workout write).
- On Android: a **Wear OS** companion (follow the phone's workout, log sets and
  control rest from the wrist), an **ongoing workout notification** with the
  rest countdown and actions, and **Health Connect** (workout write; heart rate,
  active calories, bodyweight and body fat read).
- **Export / import** — a JSON or workout CSV, for backup or moving in
  from another tracker.
- **Bodyweight movements count toward volume** — set your weight manually or pull
  it from Apple Health or Health Connect, snapshotted per workout so past sessions
  keep their numbers.
- **Merge duplicate exercises** without losing history or PRs.
- **736-exercise catalog** bundled in the app — names, muscles and instructions
  from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public
  domain). Its exercise *photographs* are deliberately not used; see
  [NOTICE](NOTICE).
- **Line-art illustrations** for the common movements, animated through the rep,
  on the exercise screen and the Lock Screen card. Artwork from
  [Workout Guide](https://github.com/bryllim/workout-guide) /
  [Everkinetic](https://github.com/everkinetic/data), CC BY-SA 4.0. Coverage is
  partial on purpose: an illustration is only shown when it depicts that exact
  movement, so the rest of the catalog shows initials rather than a wrong picture.

## Platform support

**iPhone on the App Store; Android and Wear OS in closed testing on Google Play.**
Ischys is built and tested on iPhone first (iOS 26, Expo SDK 57), with its Apple
Watch companion, Live Activity and Apple Health.

The same codebase now also runs on Android. The full core app is there: logging
sets, routines, the rest timer with an on-time alert, personal records, history,
the exercise catalog and custom exercises, merging duplicates, measurements, the
plate and 1RM calculators, CSV import, CSV/JSON export, share-as-image and accent
themes. The iOS extras have Android counterparts:

| iPhone | Android |
| --- | --- |
| Apple Health | **Health Connect** — saves finished workouts; reads bodyweight, body fat, and the heart rate and active calories another device recorded during a workout |
| Live Activity | **Ongoing workout notification** with the rest countdown and actions (a Live Update on Android 16) |
| Apple Watch app | **Wear OS app** — follows the phone's workout, logs sets and controls rest from the wrist, live heart rate and calories |

**Where it stands.** The Android phone app is in closed testing on Google Play
and is not publicly listed yet. The Wear OS app has been submitted to its own
closed testing track and is awaiting Google's review. Google requires a new
developer account to run a closed test before a public release, so both will be
publicly available soon, but there is no date. When it is public, the listing
will be at `play.google.com/store/apps/details?id=app.ischys.mobile`.

**How Android differs today.**

- It has had far less real-world use than the iPhone app, so expect rough edges.
- The workout notification is a standard system notification, not a custom card
  with artwork like the Live Activity.
- Without the watch app there is no live heart rate on the phone. Health Connect
  supplies what another device recorded, not a live stream.
- With the phone app fully closed, the Wear OS watch can finish or discard a
  workout but cannot start one or log sets.
- The Wear OS app has been verified on an emulator paired with a real phone, not
  yet on real watch hardware.

## Stack

React Native + **Expo SDK 57** (New Architecture), **expo-sqlite** + **Drizzle
ORM** for the on-device database, TypeScript throughout. Native modules for
HealthKit and Health Connect, the Live Activity and the Android workout
notification, and the phone's link to the Wear OS app live under
`frontend/modules/`. The Apple Watch app and the Live Activity widget are in
`frontend/targets/` (Swift); the Wear OS app is in `frontend/wear/` (Kotlin).

```
Ischys/
└── frontend/
    ├── app/            screens (expo-router)
    ├── src/
    │   ├── db/         SQLite schema, migrations, bundled catalog seed
    │   ├── data/       local repository (the app's data layer)
    │   ├── domain/     pure training logic (stats, records, streaks…) + tests
    │   └── components/ UI
    ├── modules/        local native modules (health, workout card, Wear OS link, exact alarms)
    ├── targets/        Apple Watch app + Live Activity widget
    └── wear/           Wear OS app (its own Gradle project)
```

## Build & run

Ischys is [on the App Store](https://apps.apple.com/app/id6790443643) (free) if
you just want to use it. To build it yourself, you'll need **macOS with Xcode**
(for the iOS build) and a free Apple developer account to sign it onto your own
device.

```bash
cd frontend
npm install
npx expo run:ios --device   # build + install on a connected iPhone
# or drop --device to run in the iOS Simulator
```

For Android you'll need **JDK 17** and the **Android SDK**:

```bash
cd frontend
npm install
npx expo run:android        # build + install on a connected phone or emulator
```

The signed bundles Google Play takes are built with `npm run release:android`
for the phone (after `npx expo prebuild -p android`; see
`frontend/scripts/build-android-release.mjs`) and `node wear/build-release.mjs`
for the watch. Both read the upload key from an untracked
`frontend/signing.local.json` — copy `signing.local.example.json`. The watch app
must be signed with the same key as the phone app, or the two will not connect.

The app opens straight to your training — there's no server to point at and no
sign-in. `npm run typecheck` and `npm test` (pure-logic unit tests, run in both
UTC and a non-UTC timezone) gate every change.

## Licence

**The code is MIT** — see [LICENSE](LICENSE). Clone it, build it, ship it.

**The bundled exercise artwork is not MIT.** It is
[Workout Guide](https://github.com/bryllim/workout-guide) /
[Everkinetic](https://github.com/everkinetic/data) line art under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which permits
commercial use but asks for credit, a link to the licence, a note of what you
changed, and that adaptations of the artwork stay under CC BY-SA 4.0. If you
reuse this repo, carry that attribution across — it applies to
`frontend/src/data/exerciseArt.generated.ts` and the widget's `ExerciseArt`
image set, not to the code around them.

Fonts are under the SIL Open Font License. Full details and the exact changes
made to each are in [NOTICE](NOTICE).
