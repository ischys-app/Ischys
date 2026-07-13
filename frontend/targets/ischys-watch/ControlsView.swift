import SwiftUI

/// S5 — Controls. A 2×2 grid of circular actions for the running session:
/// End and Discard both close the Watch's `HKWorkoutSession` before telling the
/// phone what to do with the workout; Pause holds the session; Add asks the
/// phone to append a set. The phone remains the source of truth for the data —
/// these buttons only send intents (see `PhoneLink`).
struct ControlsView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    VStack(spacing: 0) {
      // No top clock — watchOS draws the system time top-right already.
      Spacer()

      LazyVGrid(columns: [GridItem(spacing: 12), GridItem(spacing: 12)], spacing: 12) {
        controlButton(color: Ischys.error, icon: "stop.fill", label: "End") {
          WorkoutManager.shared.end()
          PhoneLink.shared.endWorkout()
        }
        controlButton(color: Ischys.warning, icon: "pause.fill", label: "Pause") {
          WorkoutManager.shared.pause()
        }
        controlButton(color: Ischys.text2, icon: "trash", label: "Discard") {
          WorkoutManager.shared.discard()
          PhoneLink.shared.discardWorkout()
        }
        controlButton(color: Ischys.accent, icon: "plus", label: "Add") {
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
