import SwiftUI

/// S6 — Summary. End-of-session recap the phone pushes into `model.summary`.
///
/// Three states share this screen:
/// - **E2** (recap): the stat rows + accent Done, once `model.summary` arrives.
/// - **E3** (saving): the transient wait between Finish and the phone's push — a
///   spinner over dim placeholder rows.
/// - **E4** (unavailable): the phone never pushed a recap. The workout is still
///   saved, so the copy reassures and Done goes neutral (nothing succeeded here).
///
/// Follows the Theme conventions: `Ischys.mono` + `.monospacedDigit()` for every
/// number, accent reserved for the single primary action (Done). Root already
/// paints pure black, so this view sets no background.
struct SummaryView: View {
  @EnvironmentObject var model: WorkoutModel

  /// How long to wait for the phone's recap before deciding it isn't coming (E4).
  /// The phone finishes writing the workout and pushes the summary within a beat;
  /// this only trips when that push genuinely never lands.
  private let recapTimeout: UInt64 = 8_000_000_000
  @State private var timedOut = false

  var body: some View {
    ScrollView {
      if let s = model.summary {
        recap(s)
      } else if timedOut {
        unavailableState
      } else {
        savingState
      }
    }
    .task {
      // A single wait per appearance. If the summary is already here, or arrives
      // while we sleep, the `if let` above wins and this result is ignored.
      guard model.summary == nil else { return }
      try? await Task.sleep(nanoseconds: recapTimeout)
      if model.summary == nil { timedOut = true }
    }
  }

  // MARK: E2 — recap

  private func recap(_ s: SessionSummary) -> some View {
    VStack(spacing: 14) {
      header(s)
      statRows(s)
      doneButton
    }
    .padding(.vertical, 8)
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
      statRow("VOLUME", "\(grouped(s.volume)) \(s.unit)", Ischys.text1)
      statRow("SETS", "\(s.sets)", Ischys.text1)
      statRow("AVG HR", "\(s.avgHr) bpm", Ischys.error)
      statRow("ACTIVE CAL", "\(s.activeCal)", Ischys.warning)
      statRow("PRs", "\(s.prs)", Ischys.success)
    }
  }

  private func statRow(_ label: String, _ value: String, _ color: Color) -> some View {
    HStack {
      Text(label)
        .font(Ischys.mono(9.5))
        .tracking(1.0)
        .foregroundStyle(Ischys.text3)
      Spacer()
      Text(value)
        .font(Ischys.mono(17, .semibold))
        .monospacedDigit()
        .foregroundStyle(color)
    }
    .padding(.horizontal, 11)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 15).fill(Ischys.surface1)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 15).stroke(Ischys.border, lineWidth: 1)
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

  // MARK: E3 — saving

  private var savingState: some View {
    VStack(spacing: 0) {
      SavingRing()
        .frame(width: 56, height: 56)

      Text("Saving…")
        .font(Ischys.ui(20, .bold))
        .foregroundStyle(Ischys.text2)
        .padding(.top, 11)

      Text("Sending to iPhone")
        .font(Ischys.mono(11))
        .foregroundStyle(Ischys.text3)
        .padding(.top, 3)

      VStack(spacing: 6) {
        placeholderRow(labelWidth: 42, valueWidth: 56)
        placeholderRow(labelWidth: 56, valueWidth: 70)
        placeholderRow(labelWidth: 34, valueWidth: 28)
        placeholderRow(labelWidth: 48, valueWidth: 62)
      }
      .padding(.top, 14)
    }
    .padding(.vertical, 8)
  }

  private func placeholderRow(labelWidth: CGFloat, valueWidth: CGFloat) -> some View {
    HStack {
      RoundedRectangle(cornerRadius: 4).fill(Ischys.surface3)
        .frame(width: labelWidth, height: 7)
      Spacer()
      RoundedRectangle(cornerRadius: 4).fill(Ischys.surface3)
        .frame(width: valueWidth, height: 13)
    }
    .padding(.horizontal, 11)
    .padding(.vertical, 10)
    .background(RoundedRectangle(cornerRadius: 15).fill(Ischys.surface1))
    .overlay(RoundedRectangle(cornerRadius: 15).stroke(Ischys.hair, lineWidth: 1))
  }

  // MARK: E4 — recap unavailable

  private var unavailableState: some View {
    VStack(spacing: 0) {
      ZStack {
        Circle().fill(Ischys.surface2)
          .overlay(Circle().stroke(Ischys.border, lineWidth: 1))
        Image(systemName: "iphone.slash")
          .font(.system(size: 22))
          .foregroundStyle(Ischys.text3)
      }
      .frame(width: 56, height: 56)

      Text("Recap not here yet")
        .font(Ischys.ui(18, .bold))
        .foregroundStyle(Ischys.text1)
        .multilineTextAlignment(.center)
        .padding(.top, 12)

      Text("Your workout is saved. Open Ischys on your iPhone to see the full summary.")
        .font(Ischys.ui(12.5, .regular))
        .foregroundStyle(Ischys.text2)
        .multilineTextAlignment(.center)
        .lineSpacing(2)
        .padding(.top, 8)
        .padding(.horizontal, 4)

      Spacer(minLength: 16)

      Button {
        model.screen = .start
      } label: {
        Text("Done")
          .font(Ischys.ui(15, .semibold))
          .foregroundStyle(Ischys.text1)
          .frame(maxWidth: .infinity)
          .frame(height: 46)
          .background(Ischys.surface2, in: RoundedRectangle(cornerRadius: 16))
          .overlay(RoundedRectangle(cornerRadius: 16).stroke(Ischys.border, lineWidth: 1))
      }
      .buttonStyle(.plain)
    }
    .padding(.vertical, 8)
  }
}

/// E3's saving spinner: a 3px `surface3` ring with an accent arc that rotates. The
/// arc holds still under Reduce Motion (the ring alone still reads as "working").
private struct SavingRing: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var spinning = false

  var body: some View {
    ZStack {
      Circle().stroke(Ischys.surface3, lineWidth: 3)
      Circle()
        .trim(from: 0, to: 0.25)
        .stroke(Ischys.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
        .rotationEffect(.degrees(spinning ? 360 : 0))
    }
    .onAppear {
      guard !reduceMotion else { return }
      withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
        spinning = true
      }
    }
  }
}

/// Groups an integer with commas: 9177 → "9,177".
private func grouped(_ n: Int) -> String {
  let f = NumberFormatter()
  f.numberStyle = .decimal
  f.groupingSeparator = ","
  return f.string(from: NSNumber(value: n)) ?? String(n)
}
