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
- **Export / import** — a JSON or Hevy-compatible CSV, for backup or moving in
  from another tracker.
- **736-exercise catalog** bundled in the app (from
  [free-exercise-db](https://github.com/yuhonas/free-exercise-db), public domain).

## Platform support

**iOS only, for now.** Ischys is built and tested on iPhone (iOS 26, Expo SDK 57),
and its headline features — Live Activity, the Apple Watch companion, and Apple
Health — are iOS-specific with no Android equivalents yet. It's a React Native /
Expo app, so an Android build is *possible in principle*, but it has **never been
built or run on Android** and is entirely untested there. Treat Android as
unsupported until someone does that work — contributions welcome.

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

MIT — see [LICENSE](LICENSE). Third-party attributions in [NOTICE](NOTICE).
