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
    var subtitle: String
    var weightLabel: String
    var repsLabel: String
    var setId: String?
  }

  /// When the workout began. The header's "48 sec" is rendered from this with
  /// `Text(_:style:.relative)`, so it keeps counting while the app is suspended.
  /// A plain String would freeze at whatever the last update wrote.
  var workoutStartedAt: Date
}
