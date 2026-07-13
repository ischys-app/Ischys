import SwiftUI

/// S1 — Start. The Watch's entry screen: pick a routine the phone has synced, or
/// start an empty workout. Every tap starts the local `HKWorkoutSession` and asks
/// the phone to begin; the phone pushes back state that flips `model.screen` to
/// `.session`, so this view never sets the screen itself.
///
/// Follows the `ActiveSetView` conventions: Theme tokens for every colour,
/// `Ischys.mono` for numbers/labels, accent reserved for the status clock, the
/// title dot and the play affordance. Tappable cards are plain-styled Buttons.
struct StartView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 9) {
        titleRow
        emptyCard
        routinesLabel
        ForEach(model.routines) { routine in
          routineRow(routine)
        }
        footerChip
      }
    }
  }

  // "Start" + a 6pt accent dot, left-aligned.
  private var titleRow: some View {
    HStack(spacing: 6) {
      Text("Start")
        .font(Ischys.ui(22, .bold))
        .foregroundStyle(Ischys.text1)
      Circle()
        .fill(Ischys.accent)
        .frame(width: 6, height: 6)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var emptyCard: some View {
    Button {
      WorkoutManager.shared.start()
      PhoneLink.shared.startEmpty()
    } label: {
      HStack(spacing: 12) {
        ZStack {
          Circle().fill(Ischys.accent).frame(width: 40, height: 40)
          Image(systemName: "play.fill")
            .font(.system(size: 15))
            .foregroundStyle(Ischys.accentFg)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text("Empty Workout")
            .font(Ischys.ui(16, .semibold))
            .foregroundStyle(Ischys.text1)
          Text("Start fresh")
            .font(Ischys.mono(12))
            .foregroundStyle(Ischys.text3)
        }
        Spacer(minLength: 0)
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Ischys.surface1, in: RoundedRectangle(cornerRadius: 20))
      .overlay(
        RoundedRectangle(cornerRadius: 20).stroke(Ischys.border, lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
  }

  private var routinesLabel: some View {
    Text("ROUTINES")
      .font(Ischys.mono(10))
      .tracking(1.4)
      .foregroundStyle(Ischys.text3)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 2)
  }

  private func routineRow(_ routine: RoutineItem) -> some View {
    Button {
      WorkoutManager.shared.start()
      PhoneLink.shared.startRoutine(routine.id)
    } label: {
      HStack(spacing: 12) {
        Text(routine.initials)
          .font(Ischys.mono(14, .semibold))
          .foregroundStyle(Ischys.accent)
          .frame(width: 40, height: 40)
          .background(Ischys.surface3, in: RoundedRectangle(cornerRadius: 12))
        VStack(alignment: .leading, spacing: 2) {
          Text(routine.name)
            .font(Ischys.ui(16, .semibold))
            .foregroundStyle(Ischys.text1)
            .lineLimit(1).minimumScaleFactor(0.8)
          Text("\(routine.exerciseCount) exercises")
            .font(Ischys.mono(12))
            .foregroundStyle(Ischys.text3)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.system(size: 14))
          .foregroundStyle(Ischys.text3)
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Ischys.surface1, in: RoundedRectangle(cornerRadius: 20))
      .overlay(
        RoundedRectangle(cornerRadius: 20).stroke(Ischys.border, lineWidth: 1)
      )
    }
    .buttonStyle(.plain)
  }

  private var footerChip: some View {
    HStack(spacing: 6) {
      Image(systemName: "iphone")
        .font(.system(size: 11))
        .foregroundStyle(Ischys.water)
      Text("Synced with iPhone")
        .font(Ischys.mono(11))
        .foregroundStyle(Ischys.hex(0x9FC0FF))
    }
    .frame(maxWidth: .infinity, alignment: .center)
    .padding(.vertical, 8)
    .padding(.horizontal, 12)
    .background(
      Color(.sRGB, red: 76 / 255, green: 141 / 255, blue: 255 / 255, opacity: 0.08),
      in: RoundedRectangle(cornerRadius: 14)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 14)
        .stroke(
          Color(.sRGB, red: 76 / 255, green: 141 / 255, blue: 255 / 255, opacity: 0.18),
          lineWidth: 1
        )
    )
  }
}
