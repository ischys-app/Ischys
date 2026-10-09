import SwiftUI

/// S5 — Controls. A 2×2 grid of circular actions for the running session:
/// Finish asks the phone to finish and closes the Watch's `HKWorkoutSession`
/// once it has (`WorkoutModel.requestFinish`); Discard closes it at once and
/// tells the phone; Pause holds the session and becomes Resume; Add asks the phone to append a set. The phone remains the source of truth for the data —
/// these buttons only send intents (see `PhoneLink`).
///
/// DECISION 2 (resolved — see `EndOfWorkoutState` in `ActiveSetView`): this was
/// "End" in error red, but `endWorkout()` SAVES the workout to history — red
/// implies loss, and the button that actually loses data is Discard. Colours were
/// inverted. Unified with the E1 end-state: this is **Finish** in accent (the
/// primary, saving action), **Discard** now carries the error red, and **Add**
/// moves to `water` to match E1's "Add from iPhone" and keep accent to one action.
struct ControlsView: View {
  @EnvironmentObject var model: WorkoutModel
  @ObservedObject private var session = WorkoutManager.shared

  var body: some View {
    VStack(spacing: 0) {
      // No top clock — watchOS draws the system time top-right already.
      Spacer()

      LazyVGrid(columns: [GridItem(spacing: 12), GridItem(spacing: 12)], spacing: 12) {
        controlButton(color: Ischys.accent, icon: "stop.fill", label: "Finish") {
          model.requestFinish()
        }
        // One button, two states: what it does is whatever the session is
        // not doing (`SessionPause`). It used to pause and stay "Pause".
        controlButton(
          color: Ischys.warning,
          icon: session.isPaused ? "play.fill" : "pause.fill",
          label: session.isPaused ? "Resume" : "Pause"
        ) {
          session.togglePause()
        }
        controlButton(color: Ischys.error, icon: "trash", label: "Discard") {
          // No waiting for the phone here, unlike Finish. A discard saves
          // nothing to Health, so there is no recording to end up duplicated,
          // and the phone leaves the workout whether or not its delete worked.
          WorkoutManager.shared.discard()
          PhoneLink.shared.discardWorkout()
        }
        controlButton(color: Ischys.water, icon: "plus", label: "Add") {
          PhoneLink.shared.addSet()
        }
      }

      Spacer()
    }
  }

  /// One circular action: a tinted disc with an SF Symbol, a token label below.
  private func controlButton(
    color: Color,
    icon: String,
    label: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(spacing: 6) {
        Circle()
          .fill(color.opacity(0.14))
          .overlay(Circle().stroke(color.opacity(0.4), lineWidth: 1))
          .frame(width: 58, height: 58)
          .overlay(
            Image(systemName: icon)
              .font(.system(size: 24))
              .foregroundStyle(color)
          )
        Text(label)
          .font(Ischys.ui(13, .semibold))
          .foregroundStyle(Ischys.text2)
      }
    }
    .buttonStyle(.plain)
  }
}
