# Security

## Reporting a vulnerability

Please **do not open a public issue.** Use GitHub's private vulnerability reporting
(Security → Report a vulnerability) on this repository.

Include what you did, what happened, and what you expected. A proof of concept on a
build you ran yourself is ideal. Expect an acknowledgement within a week.

## Threat model

Ischys runs **entirely on the device**. There is no server, no account, and no network
service the app depends on. Your training log lives in a local SQLite database on your
phone and never leaves it except through actions you take (an **export** file you save
or share, and your normal device backup, e.g. iCloud).

That collapses most of the usual attack surface — there is no API to authenticate against,
no cross-user data access, no tokens in flight, no server to misconfigure. What remains is
device-local and supply-chain:

**Assumed:** the device owner controls the device (passcode / biometric lock, OS disk
encryption, trusted OS). Data at rest is protected by the platform, not by app-level
encryption.

**Not assumed:** that an input is well-formed. Imported CSV/JSON, pasted demo URLs, and
migrated data are untrusted and must be validated before use (e.g. only `http(s)` demo
URLs reach the video player).

## What's in scope

- Local data handling: SQL built from untrusted input, unsafe parsing of imported files,
  a pasted URL reaching a sink (video player, `Linking`) without a scheme check.
- Anything that would cause data to **leave the device** unexpectedly — an unintended
  network request, a broadened export, telemetry.
- Third-party dependencies shipped in the app (`npm audit`) and the native modules under
  `frontend/modules` / `frontend/targets`.
- The Apple Watch ↔ phone WatchConnectivity messages and HealthKit read/write scope.

## Out of scope

- Attacks that require having already unlocked the device / physical access with the
  passcode.
- Platform-level disk encryption and backup security (that is iOS/Android's responsibility).
- Issues in upstream dependencies themselves — report those upstream; we'll bump once fixed.

## For maintainers

Data never leaving the device is the core privacy guarantee. Any change that adds a network
call, a new export surface, or a third-party SDK is a security-relevant change and should say
so in its commit. Keep `npm audit` clean before a release.
