#!/usr/bin/env bash
# The widget extension and the app (via modules/live-activity) must compile the
# SAME Swift source. ActivityKit matches an Activity by its attribute type name
# and Codable shape, and LiveActivityIntent matches by type name — so a drift
# between two copies makes the card or its buttons fail silently, with no crash
# and no log.
#
# These used to be two files kept in sync by hand, checked with `cmp`. That check
# passed happily when a bad `cp` reverted a change in BOTH copies: it proved they
# matched, never that they were right. They are now symlinks into the module, so
# there is one source of truth and drift is impossible. This script guards the
# symlinks themselves.
set -euo pipefail

SHARED=(WorkoutAttributes.swift LiveActivityActions.swift WorkoutIntents.swift)
SOURCE_DIR=modules/live-activity/ios
WIDGET_DIR=targets/ischys-widget

status=0
for file in "${SHARED[@]}"; do
  link="$WIDGET_DIR/$file"
  source="$SOURCE_DIR/$file"

  if [ ! -f "$source" ]; then
    echo "✗ $source is missing — it is the source of truth" >&2
    status=1
    continue
  fi

  if [ ! -L "$link" ]; then
    echo "✗ $link is a real file, not a symlink." >&2
    echo "  Someone copied it. Two copies drift; ActivityKit then silently" >&2
    echo "  fails to match the Activity. Restore with:" >&2
    echo "    ln -sf ../../$SOURCE_DIR/$file $link" >&2
    status=1
    continue
  fi

  # Resolves to the module copy, and actually points at something.
  if [ ! -e "$link" ]; then
    echo "✗ $link is a broken symlink" >&2
    status=1
  elif ! [ "$(cd "$WIDGET_DIR" && readlink "$file")" = "../../$SOURCE_DIR/$file" ]; then
    echo "✗ $link points somewhere unexpected: $(readlink "$link")" >&2
    status=1
  fi
done

[ "$status" -eq 0 ] || exit 1
echo "live-activity: ${#SHARED[@]} shared files symlinked to $SOURCE_DIR"
