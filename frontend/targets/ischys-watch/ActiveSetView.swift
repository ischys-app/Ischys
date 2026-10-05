import SwiftUI

/// S2 — Active Set (the core screen). Mirrors the set the phone is on; the Crown
/// adjusts whichever value is selected (tap weight or reps to switch), and Log
/// Set sends it back to the phone and advances.
///
/// Reference implementation for the other screens: Theme tokens for every
/// colour, `Ischys.mono` + `.monospacedDigit()` for all numbers, accent reserved
/// for the elapsed clock, the selected field, and the single primary action.
struct ActiveSetView: View {
  @EnvironmentObject var model: WorkoutModel

  private enum Field { case weight, reps }
  @State private var editing: Field = .weight
  /// Crown-driven value for the selected field, written back as a string.
  @State private var crownValue: Double = 0
  /// Set while a `seedCrown` write is in flight, so the `crownValue` change it
  /// causes is not mistaken for the user turning the Crown.
  @State private var seeding = false
  @FocusState private var crownFocused: Bool

  private var content: some View {
    VStack(spacing: 0) {
      statusRow
      exerciseHeader
      Spacer(minLength: 4)
      valueBlock
      Spacer(minLength: 4)
      // While resting, the non-blocking banner (in SessionView) takes this slot —
      // the set is already logged, so Log Set is redundant. Reserve its height so
      // the value block doesn't jump when the banner comes and goes.
      if model.resting {
        Color.clear.frame(height: 52)
      } else {
        setDots
        logButton
      }
    }
  }

  var body: some View {
    // E1 — nothing left to log: the page becomes the end-of-workout state rather
    // than stranding the user on a Log Set button with no set to log.
    if model.allSetsDone {
      EndOfWorkoutState()
    } else {
      content
        .focusable(true)
        .focused($crownFocused)
        // One notch is one weight step in the user's unit (0.5 kg / 2.5 lb, see
        // `WorkoutModel.weightStep`). Reps keep the 0.5 granularity and round
        // to whole (below), so a rep still takes the two notches it always did.
        .digitalCrownRotation(
          $crownValue, from: 0, through: 999, by: editing == .weight ? model.weightStep : 0.5,
          sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
        )
        .onChange(of: crownValue) { _, v in applyCrown(v) }
        // Re-seed whenever the phone replaced the values — a new set, or an edit
        // to the one we are on. Keyed on the model's seed counter rather than
        // `setNum`, which missed the second case entirely (#30).
        .onChange(of: model.valueSeed) { _, _ in seedCrown() }
        .onAppear {
          seedCrown()
          crownFocused = true
        }
    }
  }

  private func select(_ field: Field) {
    editing = field
    seedCrown()
  }

  private func seedCrown() {
    // A comma-locale keyboard on the phone yields "24,8"; `Double` would reject
    // it and drop the Crown to 0, so normalise the separator first.
    let text = editing == .weight ? model.weight : model.reps
    let next = Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
    // An unchanged value fires no `onChange`, so `seeding` must not be armed for
    // a write that will never land — it would swallow the user's next real turn.
    guard next != crownValue else { return }
    seeding = true
    crownValue = next
  }

  private func applyCrown(_ v: Double) {
    // Our own seed, not the user's wrist: leave the phone's value exactly as
    // pushed rather than rewriting it through the step rounding below.
    if seeding {
      seeding = false
      return
    }
    model.noteCrownEdit()
    if editing == .weight {
      // Snap to the unit's step: whole numbers show plain, halves show one
      // decimal ("102.5", "227.5"). A pushed value off the grid — 220.46 lb
      // from a kilogram-era set — lands on it at the first notch.
      let step = model.weightStep
      let w = (v / step).rounded() * step
      model.weight = w == w.rounded() ? String(Int(w)) : String(w)
    } else {
      model.reps = String(Int(v.rounded()))
    }
  }

  // Heart + HR, left-aligned. The elapsed clock is NOT here — watchOS draws the
  // system time top-right, so our own clock collided with it. Elapsed lives on
  // the Metrics page.
  private var statusRow: some View {
    HStack(spacing: 3) {
      Image(systemName: "heart.fill").font(.system(size: 11)).foregroundStyle(Ischys.error)
      Text("\(model.heartRate)").font(Ischys.mono(13)).monospacedDigit().foregroundStyle(Ischys.text1)
      Spacer()
    }
  }

  private var exerciseHeader: some View {
    VStack(alignment: .leading, spacing: 1) {
      // Above the name, because inside a superset no rest timer starts between
      // partners — without saying so, that reads as the timer being broken
      // rather than the round still being in progress.
      if !model.supersetLabel.isEmpty {
        Text(model.supersetLabel)
          .font(Ischys.mono(10))
          .foregroundStyle(Ischys.text3)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      Text(model.exerciseName)
        .font(Ischys.ui(18, .semibold)).foregroundStyle(Ischys.accent)
        .lineLimit(1).minimumScaleFactor(0.8)
      Text("Set \(model.setNum) of \(model.setCount) · \(model.equipment)")
        .font(Ischys.mono(12)).foregroundStyle(Ischys.text3)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, 2)
  }

  private var valueBlock: some View {
    VStack(spacing: 2) {
      // Tap to choose which value the Crown edits; the selected one glows accent.
      Button { select(.weight) } label: {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
          Text(model.weight.isEmpty ? "0" : Ischys.shortWeight(model.weight))
            .font(Ischys.mono(58, .semibold)).monospacedDigit()
            .tracking(-1.5)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(editing == .weight ? Ischys.accent : Ischys.text1)
          Text(model.unit).font(Ischys.ui(18, .medium)).foregroundStyle(Ischys.text2)
        }
      }
      .buttonStyle(.plain)

      Button { select(.reps) } label: {
        HStack(alignment: .lastTextBaseline, spacing: 5) {
          Text("×").font(Ischys.mono(30, .semibold)).foregroundStyle(Ischys.text3)
          Text(model.reps.isEmpty ? "0" : model.reps)
            .font(Ischys.mono(30, .semibold)).monospacedDigit()
            .foregroundStyle(editing == .reps ? Ischys.accent : Ischys.text1)
          Text("reps").font(Ischys.ui(15, .medium)).foregroundStyle(Ischys.text2)
        }
      }
      .buttonStyle(.plain)

      // While resting the just-logged value stands in for the previous-set hint,
      // labelled LOGGED in success. The whole block dims to 0.45 (W1).
      if model.resting {
        Text("LOGGED")
          .font(Ischys.mono(10.5)).tracking(1.5)
          .foregroundStyle(Ischys.success)
          .padding(.top, 2)
      } else {
        Text(prevLabel)
          .font(Ischys.mono(11.5)).foregroundStyle(Ischys.text3)
          .padding(.top, 2)
      }
    }
    .opacity(model.resting ? 0.45 : 1)
  }

  private var prevLabel: String {
    guard !model.prevWeight.isEmpty || !model.prevReps.isEmpty else { return " " }
    return "prev  \(Ischys.shortWeight(model.prevWeight)) \(model.unit) × \(model.prevReps)"
  }

  // 6 pills: done/active = accent (active wider), pending = surface-3.
  private var setDots: some View {
    HStack(spacing: 4) {
      ForEach(Array(model.setDots.enumerated()), id: \.offset) { _, dot in
        Capsule()
          .fill(dot == .pending ? Ischys.surface3 : Ischys.accent)
          .frame(width: dot == .active ? 18 : 6, height: 6)
      }
    }
    .frame(height: 8)
    .padding(.bottom, 6)
  }

  private var logButton: some View {
    Button {
      PhoneLink.shared.logSet(weight: model.weight, reps: model.reps, unit: model.unit)
    } label: {
      HStack(spacing: 6) {
        Image(systemName: "checkmark").font(.system(size: 15, weight: .bold))
        Text("Log Set").font(Ischys.ui(16, .bold))
      }
      .frame(maxWidth: .infinity)
      .frame(height: 38)
      .foregroundStyle(Ischys.accentFg)
      .background(Ischys.accent, in: RoundedRectangle(cornerRadius: 18))
    }
    .buttonStyle(.plain)
  }
}

/// E1 — end of workout. Shown on the Active Set page (the dots stay; this is not a
/// new screen) once every planned set is logged. A success disc, the count, then
/// the two end actions.
///
/// DECISION 1 (recommended): the actions are **Finish Workout** + **Add from
/// iPhone**. Finishing is what the user came to do, so it takes the accent; adding
/// hands off to the phone, which is the only place the exercise library lives.
///
/// DECISION 2 (resolved): this Finish button and `ControlsView` both call the same
/// `PhoneLink.endWorkout()`, which SAVES the workout. They now read the same —
/// **"Finish" in accent** in both places. ControlsView's old "End" in error red was
/// inverted (red implies loss, but the losing action is Discard), so Discard took
/// the error red there and Finish took the accent. One action, one name, one colour.
struct EndOfWorkoutState: View {
  @EnvironmentObject var model: WorkoutModel

  private var statLine: String {
    let name = model.routineName.isEmpty ? "Workout" : model.routineName
    return "\(name) · \(model.setsDone) sets · \(Ischys.clock(model.elapsedSec))"
  }

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Circle().fill(Ischys.success.opacity(0.15))
        Image(systemName: "checkmark")
          .font(.system(size: 28, weight: .bold))
          .foregroundStyle(Ischys.success)
      }
      .frame(width: 62, height: 62)

      Text("All sets done")
        .font(Ischys.ui(21, .bold))
        .foregroundStyle(Ischys.text1)
        .padding(.top, 12)

      Text(statLine)
        .font(Ischys.mono(11.5))
        .foregroundStyle(Ischys.text3)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .padding(.top, 5)

      Spacer(minLength: 12)

      VStack(spacing: 8) {
        finishButton
        addFromPhoneButton
      }
    }
    .padding(.top, 8)
  }

  private var finishButton: some View {
    Button {
      // Save the Watch's HKWorkoutSession, then tell the phone to finish — the
      // same end path ControlsView calls "End". See DECISION 2 above.
      WorkoutManager.shared.end()
      PhoneLink.shared.endWorkout()
    } label: {
      HStack(spacing: 7) {
        Image(systemName: "stop.fill").font(.system(size: 15))
        Text("Finish Workout").font(Ischys.ui(16, .bold))
      }
      .frame(maxWidth: .infinity)
      .frame(height: 50)
      .foregroundStyle(Ischys.accentFg)
      .background(Ischys.accent, in: RoundedRectangle(cornerRadius: 17))
    }
    .buttonStyle(.plain)
  }

  private var addFromPhoneButton: some View {
    Button {
      // The Watch can't browse the exercise library, so this hands off: the phone
      // appends a set the user can then edit there.
      PhoneLink.shared.addSet()
    } label: {
      HStack(spacing: 7) {
        Image(systemName: "iphone").font(.system(size: 13)).foregroundStyle(Ischys.water)
        Text("Add from iPhone").font(Ischys.ui(13.5, .semibold)).foregroundStyle(Ischys.text2)
      }
      .frame(maxWidth: .infinity)
      .frame(height: 44)
      .background(Ischys.surface2, in: RoundedRectangle(cornerRadius: 15))
      .overlay(RoundedRectangle(cornerRadius: 15).stroke(Ischys.border, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }
}
