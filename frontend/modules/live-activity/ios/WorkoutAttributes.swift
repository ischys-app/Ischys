import ActivityKit
import Foundation

// ⚠️ This file is compiled into BOTH the app (via modules/live-activity) and the
// widget extension. ActivityKit matches activities by attribute type name and
// Codable shape, so the two copies must stay byte-identical. `npm run lint:la`
// checks this; keep them in sync or the Activity silently fails to start.
struct WorkoutAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// The exercise being worked. Lives here, not in the attributes: a workout
    /// moves between exercises, and attributes are fixed for the Activity's
    /// whole life — changing one would mean ending and restarting the card.
    var exerciseName: String

    /// Slug of the bundled line-art for this exercise, e.g. "bench-press", or
    /// nil where we have no artwork (the card then shows the initials monogram).
    /// It names an imageset in the widget's own asset catalog — the extension
    /// cannot read JS, so the art ships as images and only the key crosses over.
    ///
    /// Optional with a default: a build that adds a field must still decode the
    /// payload of a card that an older build started, or the Activity silently
    /// stops updating.
    var artSlug: String? = nil

    /// "logging" or "rest".
    var mode: String
    /// "Set 2 of 4" or "Next: set 2 of 4 (154 kg × 12 reps)".
    var subtitle: String

    // Logging state.
    var weightLabel: String
    var repsLabel: String

    // Rest state. `Text(timerInterval:)` ticks on-device from these, so the
    // countdown and the progress bar need no pushes and no updates.
    var restStartedAt: Date?
    var restEndsAt: Date?

    /// The set the ✓ button completes. Nil when there is nothing to complete.
    var setId: String?

    // Enough to redraw the card when ✓ is tapped, without waiting for JS to
    // wake and push. JS still performs the write; this only keeps the card
    // responsive on a locked phone.

    /// Rest to start once the current set is completed.
    var restSeconds: Int
    /// The card after the current set is done. Nil on the workout's last set.
    var next: NextSet?
  }

  /// A snapshot of the card once the current set is completed.
  struct NextSet: Codable, Hashable {
    var exerciseName: String
    /// See `ContentState.artSlug` — carried so the optimistic redraw after ✓
    /// swaps the thumbnail too when the next set is a different exercise.
    var artSlug: String? = nil
    var subtitle: String
    var weightLabel: String
    var repsLabel: String
    var setId: String?
  }

  /// When the workout began. The header's "48 sec" is rendered from this with
  /// `Text(_:style:.relative)`, so it keeps counting while the app is suspended.
  /// A plain String would freeze at whatever the last update wrote.
  var workoutStartedAt: Date

  /// Whose workout this is, as the first name ("Maria"). Set only when the
  /// phone has two or more profiles; nil leaves the card exactly as it was.
  ///
  /// Optional with a default, and static: a card started by an older build has
  /// no such key and must still decode, and the profile cannot change under a
  /// running workout.
  var profileName: String? = nil

  /// The profile's initials ("MP"), drawn in the square beside the title.
  /// Set and unset together with `profileName`.
  var profileInitials: String? = nil
}
