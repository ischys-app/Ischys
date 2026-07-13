import SwiftUI

/// S6 — Summary. End-of-session recap the phone pushes into `model.summary`.
///
/// Follows the Theme conventions: `Ischys.mono` + `.monospacedDigit()` for every
/// number, accent reserved for the single primary action (Done). Root already
/// paints pure black, so this view sets no background.
struct SummaryView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    ScrollView {
      if let s = model.summary {
        VStack(spacing: 14) {
          header(s)
          statRows(s)
          doneButton
        }
        .padding(.vertical, 8)
      } else {
        Text("No summary")
          .font(Ischys.mono(13))
          .foregroundStyle(Ischys.text3)
          .frame(maxWidth: .infinity)
          .padding(.top, 40)
      }
    }
  }

  private func header(_ s: SessionSummary) -> some View {
    VStack(spacing: 6) {
      ZStack {
        Circle().fill(Ischys.success.opacity(0.15))
        Image(systemName: "checkmark")
          .font(.system(size: 26, weight: .bold))
          .foregroundStyle(Ischys.success)
      }
      .frame(width: 56, height: 56)

      Text("Nice work")
        .font(Ischys.ui(21, .bold))
        .foregroundStyle(Ischys.text1)

      Text("\(s.routineName) · \(s.dateLabel)")
        .font(Ischys.mono(11.5))
        .foregroundStyle(Ischys.text3)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .frame(maxWidth: .infinity)
  }

  private func statRows(_ s: SessionSummary) -> some View {
    VStack(spacing: 6) {
      statRow("TIME", s.timeLabel, Ischys.text1)
      statRow("VOLUME", "\(grouped(s.volumeKg)) kg", Ischys.text1)
      statRow("SETS", "\(s.sets)", Ischys.text1)
      statRow("AVG HR", "\(s.avgHr) bpm", Ischys.error)
      statRow("ACTIVE CAL", "\(s.activeCal)", Ischys.warning)
      statRow("PRs", "\(s.prs)", Ischys.success)
    }
  }

  private func statRow(_ label: String, _ value: String, _ color: Color) -> some View {
    HStack {
      Text(label)
        .font(Ischys.mono(10.5))
        .tracking(1.0)
        .foregroundStyle(Ischys.text3)
      Spacer()
      Text(value)
        .font(Ischys.mono(18, .semibold))
        .monospacedDigit()
        .foregroundStyle(color)
    }
    .padding(11)
    .background(
      RoundedRectangle(cornerRadius: 16).fill(Ischys.surface1)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16).stroke(Ischys.border, lineWidth: 1)
    )
  }

  private var doneButton: some View {
    Button {
      model.screen = .start
    } label: {
      Text("Done")
        .font(Ischys.ui(16, .bold))
        .foregroundStyle(Ischys.accentFg)
        .frame(maxWidth: .infinity)
        .frame(height: 46)
        .background(
          RoundedRectangle(cornerRadius: 16).fill(Ischys.accent)
        )
    }
    .buttonStyle(.plain)
  }
}

/// Groups an integer with commas: 9177 → "9,177".
private func grouped(_ n: Int) -> String {
  let f = NumberFormatter()
  f.numberStyle = .decimal
  f.groupingSeparator = ","
  return f.string(from: NSNumber(value: n)) ?? String(n)
}
