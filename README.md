# Ischys · ΙΣΧΥΣ

**A private, on-device workout tracker.** _Ischys_ (ἰσχύς) is Ancient Greek for
*strength*. Your entire training log lives on **your phone** — no account, no
server, no cloud. Nothing ever leaves the device.

**[⬇︎ Download on the App Store](https://apps.apple.com/app/id6790443643)** ·
free · iPhone. Or [build it from source](#build--run) — it's open, MIT-licensed,
and the whole thing runs on-device either way.

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
  (iCloud), and you can **export** a JSON/CSV copy anytime.
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
- **Export / import** — a JSON or workout CSV, for backup or moving in
  from another tracker.
- **Bodyweight movements count toward volume** — set your weight manually or pull
  it from Apple Health, snapshotted per workout so past sessions keep their numbers.
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

**iPhone first, Android in testing.** Ischys is built and tested on iPhone (iOS 26,
Expo SDK 57), and its headline extras — Live Activity, the Apple Watch companion,
and Apple Health — are iOS-only with no Android equivalents yet.

The core app also runs on Android: logging, routines, the rest timer, records,
import and export. It builds from the same source (`npm run release:android`,
see `frontend/scripts/build-android-release.mjs`) and is in testing on Google
Play. It has had far less use there than on iPhone, so expect rough edges.

## Stack

React Native + **Expo SDK 57** (New Architecture), **expo-sqlite** + **Drizzle
ORM** for the on-device database, TypeScript throughout. Native modules for the
Watch companion, Live Activity, and HealthKit live under `frontend/modules/` and
`frontend/targets/`.

```
Ischys/
└── frontend/
    ├── app/            screens (expo-router)
    ├── src/
    │   ├── db/         SQLite schema, migrations, bundled catalog seed
    │   ├── data/       local repository (the app's data layer)
    │   ├── domain/     pure training logic (stats, records, streaks…) + tests
    │   └── components/ UI
    ├── modules/        local native modules (Live Activity, HealthKit)
    └── targets/        Apple Watch app + Live Activity widget
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
