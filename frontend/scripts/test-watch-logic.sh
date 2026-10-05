#!/usr/bin/env bash
# Runs the Watch's decision logic on the Mac.
#
# Nothing in the Watch target can run without a device, so each rule worth
# testing lives in one Foundation-only file (targets/ischys-watch/<Name>.swift)
# that this compiles next to its tests (scripts/watch-tests/<Name>Tests.swift).
# Needs the Swift toolchain, so it is not part of `npm test`, which also runs on
# machines without one.
set -euo pipefail

cd "$(dirname "$0")/.."

out="$(mktemp -d "${TMPDIR:-/tmp}/watch-logic.XXXXXX")"
trap 'rm -rf "$out"' EXIT

for tests in scripts/watch-tests/*Tests.swift; do
  name="$(basename "$tests" Tests.swift)"
  echo "== $name"
  mkdir -p "$out/$name"
  # The file holding top-level code must be called main.swift.
  cp "$tests" "$out/$name/main.swift"
  xcrun swiftc -module-cache-path "$out/module-cache" -o "$out/$name/tests" \
    "targets/ischys-watch/$name.swift" "$out/$name/main.swift"
  "$out/$name/tests"
done
