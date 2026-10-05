#!/usr/bin/env bash
# Runs the Watch's end-of-rest haptic rule on the Mac.
#
# Nothing in the Watch target can run without a device, so the rule lives in one
# Foundation-only file (targets/ischys-watch/RestAlarm.swift) that this compiles
# next to its tests. Needs the Swift toolchain, so it is not part of `npm test`,
# which also runs on machines without one.
set -euo pipefail

cd "$(dirname "$0")/.."

out="$(mktemp -d "${TMPDIR:-/tmp}/rest-alarm.XXXXXX")"
trap 'rm -rf "$out"' EXIT

# The file holding top-level code must be called main.swift.
cp scripts/watch-tests/RestAlarmTests.swift "$out/main.swift"
xcrun swiftc -module-cache-path "$out/module-cache" -o "$out/rest-alarm-tests" targets/ischys-watch/RestAlarm.swift "$out/main.swift"
"$out/rest-alarm-tests"
