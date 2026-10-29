# Profiles: design

Issue: #117 · Design handoff: `design-handoff/design_handoff_profiles/` (board 16a) · Date: 2026-10-29

## Intent

Several people can keep separate training data on one phone, and switch between them the way you switch accounts on Instagram. The issue asked for a "Coach Mode" so a personal trainer can log sessions for clients instead of using notes or spreadsheets. The owner chose a broader version. One mechanism covers both trainers and people who share a phone, and there is no mode to turn on.

**Success:** a trainer can create a client, log that client's session, and switch back to their own profile. Nothing is written into the wrong person's history, Apple Health or rings. Someone who never adds a profile sees the app exactly as before, apart from one new Settings section.

## Goals

- Each profile has its own history, routines, records, progression, measurements, bodyweight and training settings.
- Switch from a long-press on the Profile tab, the Profile header (2+ profiles), Settings, or a VoiceOver/TalkBack action.
- Add, rename, reorder and delete profiles. Delete offers an export first.
- Export and import per profile.
- With 2+ profiles it is always clear whose data is on screen: the tab avatar, and the chip on the workout and Summary screens.
- Apple Health, Health Connect and the Watch (Apple Watch and Wear OS) work for the owner profile only. Extra profiles can't turn them on.

## Non-goals (v1)

- Small-group sessions (one workout for several profiles). The handoff sketches a v2 path; v1 must not block it.
- Changing which profile is the owner.
- Creating a profile from an import.
- Health or the Watch for a non-owner profile, in any form: no writes, no reads (bodyweight, heart rate, calories), no Watch session.
- Sync or cloud anything. Everything stays on the phone.
- A passcode or lock per profile.

## Anti-goals (failure even if it works)

- A single-profile user notices any change beyond the Settings PROFILE section (P1b).
- A client's workout lands in the owner's Health data, rings or Watch.
- A set is logged into the wrong profile because the screen didn't make the current one clear, or because a stale cache served the previous profile's data after a switch.
- Existing data is moved, rewritten or put at risk by the upgrade. The owner's database stays where it is.
- Competitor names appear in copy (project rule).

## Decided by the owner

- Instagram-style profiles, not Coach Mode, and kept that way even if the requester pushes back.
- Health and the Watch are **owner-only** (decided 2026-10-29). This replaces the issue reply's "off by default" and the handoff's P10 toggles. Why: the Watch runs its own `HKWorkoutSession` (`targets/ischys-watch/WorkoutManager.swift`) and saves to Apple Health from the wrist, so a Watch toggle separate from Health can't be honest. A client's workouts in the owner's Health would only pollute the owner's rings and records.
- One active workout at a time across all profiles.
- Separate data per profile, export and import per profile.
- Design pass first. That pass is board 16a, and its decisions A–H plus "Decisions 1–12" in the handoff README are accepted as written, except for the corrections below.

## Corrections to the handoff (my calls)

1. **P10 becomes informational (owner's decision).** No toggles and no confirm sheet. The Health screen in a non-owner profile keeps the header block ("Off for ‹First›", "Apple Health on this iPhone belongs to ‹Owner›. ‹First›'s workouts stay in Ischys.") and drops the `FOR ‹FIRST›` card. In its place goes one `text2` line: "Health and the Watch work only in ‹Owner›'s profile." The Settings rows read `Off for ‹First›` and open that screen. P4's read-only HEALTH & WATCH rows and footer stay as drawn. The handoff's "count toward his rings" copy goes with the toggles. No copy uses pronouns for the owner.
2. **"Default rest" doesn't exist.** P9 lists a *Default rest* setting that the app doesn't have. The existing **Auto-start rest timer** is per profile and sits where P9 drew Default rest. No new setting is added.
3. **Wear OS.** The handoff says "Android: no Watch rows". But `frontend/wear/` is a shipped Wear OS companion, so the owner-only rule applies to it exactly as to Apple Watch: the same copy with "Watch" in place of "Apple Watch". The rows show on Android wherever the Watch rows show today.
4. **Owner name in copy.** "‹Owner›" is the owner profile's name from the registry. If it's still the default name, the copy says "the phone's owner".

## How it works

### Storage

- **One SQLite file per profile.**
  - The owner's file is today's `ischys.db`, unchanged. Upgrading moves nothing.
  - Each new profile gets `ischys-<profileId>.db`.
  - Catalog exercise ids are deterministic (UUIDv5), so a catalog exercise has the same id in every file.
- **The owner file is also the device file.** It holds:
  - a new `profiles` table: `id`, `name`, `initials`, `sort`, `is_owner`, `created_at`. The owner row has id `owner` and `is_owner = 1`, created by the migration from the stored name (`ischys.profile.name`, or the default).
  - the device-wide settings (appearance, theme, haptics, rest-timer alerts), which stay in the owner file's `settings` row where they are today.
- **Two connections:**
  - `deviceDb`: always the owner file, always open. Used by the registry and by device settings reads and writes.
  - `db`: the current profile's file. It equals `deviceDb` while the owner is active.
- **`db` stays the import every repo uses** (14 modules). It becomes a stable facade that forwards to the current connection, so no call site changes. `atomically` and `transactionOpen` follow the same current connection.
- **New profile files** run the Drizzle migrations through the non-hook `migrate()`, then the catalog seed and the settings row: the same steps as `bootstrap.ts`, which is factored into an `openProfileDb(id)` that both paths use.
- **Connections:** at most two are open (owner plus current). Switching away from a non-owner profile closes its connection.

### Settings scope (P9, with correction 2)

- **Per profile:** unit, effort mode, auto-start rest timer, weekly goal, bodyweight, bar & plates, deload advice, count warm-ups, name, initials.
- **Device:** appearance, theme, haptics, rest-timer alerts, Health connection.

Where each one lives:

- **SQLite `settings` row:** per-profile fields are read from the current profile's row. Device fields are always read from `deviceDb`. `settingsRepo` splits into those two reads, and the returned `SettingsOut` shape doesn't change.
- **SecureStore per-profile keys** (`ischys.weeklyWorkoutTarget`, `ischys.bodyweightKg`, `ischys.countWarmupsInVolume`, `ischys.deloadState`, `ischys.plateSetup`, `ischys.plateSetup.lb`, `ischys.profile.name`):
  - The owner keeps today's key names, so nothing is migrated.
  - Other profiles use `ischys.p.<profileId>.<same key>`, built by one `profileKey(key)` helper.
  - After the migration the profile name comes from the registry. `profileName.ts` reads it there.
- **Device keys stay global:** theme, chart range, exercise demo media, the Live Activity hint, everything Health (`ischys.health*`).
- **`ischys.activeWorkoutId` and `ischys.restSession`** stay global, because only one workout can be active. They gain the owning `profileId`.
- **New device key:** `ischys.activeProfileId`. It records the last-used profile (decision 11). On launch, if a workout is active, its profile wins.

### Switching (P7)

1. Refuse if a workout is active (P6 sheet) or a transaction is open.
2. Open the target file, which migrates on first open, and point `db` at it.
3. Call every registered reset hook. Each module with in-memory state registers one through a small `onProfileSwitch(fn)` registry. At least these need auditing: `summaryCache`, `weightUnit`, `effortMode`, `exercisePicker`, `pendingSelection`, `prBackfill`, `healthSync`, `restSession`, `liveActivityBridge`, `watchFinish`, `src/data/ids.ts`.
4. Bump a `profileEpoch` that keys the tab navigator, so every screen remounts. This also resets scroll positions to the top, as P7 asks. Run the 180ms cross-fade around the remount; with Reduce Motion, swap instantly.
5. Selection haptic, and the VoiceOver announcement "Switched to ‹Full name›".

**Rejected:** reloading the JS bundle on switch. It is simplest and safest for stale state, but it shows a splash for about a second, which breaks P7.

### Health, Watch, Live Activity

- **One gate:** `isOwnerActive()`. Every Health write, Health read (bodyweight, HR/CAL strip), Health edit or delete sync, `startWatchSession()` and Wear session note checks it. Apart from the owner rule, none of them change.
  - Edits and deletes of the owner's workouts sync to Health as today.
  - A non-owner profile has never written to Health, so there is nothing to clean up when it is deleted.
  - The HR/CAL strip is hidden for non-owner profiles.
- **Watch, both Apple and Wear OS:** while a non-owner profile is active, the phone sends the companion an "off for ‹First›" state. The Watch shows only that screen (decision 12), offers no routines and can't start a workout. Switching back to the owner re-sends today's state, including the routine list.
- **Active workout started from the Watch** while the owner is active belongs to the owner, as today.
- **Live Activity:** `WorkoutAttributes` gains `profileName` and `profileInitials`, set only when there are 2+ profiles (P6). This needs a native rebuild.

### Export, import, delete

- **Export and import** as in P11. File stem `ischys-<slug>-YYYY-MM-DD` with 2+ profiles. With one profile the name is unchanged. The JSON gains `profile: { name, initials }`, and import ignores it.
- **Delete** as in P8b:
  - If the profile is active, switch to the owner first.
  - Then close its connection and delete its file.
  - Then delete its `ischys.p.<id>.*` SecureStore keys and its registry row.
  - The owner can't be deleted. A profile with the active workout can't be deleted.
- **Copy routines on create** (P4): copy the current profile's routines with their exercises and target sets into the new file. Copy any custom (non-catalog) exercise they reference too, keeping its id. The copies are independent.

## Constraints

- Expo / React Native, expo-router, Drizzle + expo-sqlite. No new native module unless the facade turns out to be impossible without one.
- `db.transaction` callbacks stay synchronous, and `atomically` bodies await only database statements (see `src/db/client.ts`).
- Pure logic gets `node --test` tests in the existing style:
  - key scoping
  - initials derivation
  - file slug
  - the switch guard
  - which settings belong to the profile and which to the device
  - the Health gate
- The UI follows board 16a, with existing tokens only.
- Light and dark mode.
- Work lands on a branch with one PR. The feature can sit behind a flag until the Health/Watch gating is in, because a profile must never exist without it.

## Left to the builder

- How the `db` facade is typed and implemented, as long as call sites don't change and `Db`'s synchronous-transaction typing survives.
- The exact list of modules that need reset hooks, from an audit. The list above is the minimum.
- Phasing inside the PR. Health and Watch gating ship no later than the first build where Add profile is reachable.
- The Wear OS side of "off for ‹First›" (the message shape over the existing pairing bridge).
