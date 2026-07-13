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
  @FocusState private var crownFocused: Bool

  private var content: some View {
    VStack(spacing: 0) {
      statusRow
      exerciseHeader
      Spacer(minLength: 4)
      valueBlock
      Spacer(minLength: 4)
      setDots
      logButton
    }
  }

  var body: some View {
    content
      .focusable(true)
      .focused($crownFocused)
      // 0.5 granularity: weight snaps to 0.5 kg, reps round to whole (below).
      .digitalCrownRotation(
        $crownValue, from: 0, through: 999, by: 0.5,
        sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true
      )
      .onChange(of: crownValue) { _, v in applyCrown(v) }
      .onChange(of: model.setNum) { _, _ in seedCrown() }
      .onAppear {
        seedCrown()
        crownFocused = true
      }
  }

  private func select(_ field: Field) {
    editing = field
    seedCrown()
  }

  private func seedCrown() {
    crownValue = Double(editing == .weight ? model.weight : model.reps) ?? 0
  }

  private func applyCrown(_ v: Double) {
    if editing == .weight {
      // Keep the 0.5 step: whole numbers show plain, halves show one decimal.
      let w = (v * 2).rounded() / 2
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
          Text(model.weight.isEmpty ? "0" : model.weight)
            .font(Ischys.mono(58, .semibold)).monospacedDigit()
            .tracking(-1.5)
            .foregroundStyle(editing == .weight ? Ischys.accent : Ischys.text1)
          Text("kg").font(Ischys.ui(18, .medium)).foregroundStyle(Ischys.text2)
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

      Text(prevLabel)
        .font(Ischys.mono(11.5)).foregroundStyle(Ischys.text3)
        .padding(.top, 2)
    }
  }

  private var prevLabel: String {
    guard !model.prevWeight.isEmpty || !model.prevReps.isEmpty else { return " " }
    return "prev  \(model.prevWeight) kg × \(model.prevReps)"
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
      PhoneLink.shared.logSet(weight: model.weight, reps: model.reps)
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
