import SwiftUI

/// 1c — Non-blocking rest banner (frames W1/W2/W3). Replaces the old full-screen
/// `RestView` overlay: it's chrome pinned above the pager (see `SessionView`), so
/// the Active Set / Metrics / Controls pages all stay swipeable while resting.
///
/// The phone still owns the countdown — every ±15 / Skip is sent to it and the
/// corrected rest state is pushed straight back; the Watch never mutates the timer
/// itself. It only counts down to the end date the phone gave it, so the banner
/// keeps moving (and the wrist buzzes) while the phone is locked. Two tiers: the REST
/// label + countdown + NEXT exercise on top, the ±15 / Skip controls below, with a
/// 2px accent progress line pinned to the bottom edge as the glanceable read.
struct RestBanner: View {
  @EnvironmentObject var model: WorkoutModel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Fraction of the interval still remaining, 0…1 — the width of the progress line.
  private var progress: Double {
    guard model.restTotal > 0 else { return 0 }
    return min(1, max(0, Double(model.restRemaining) / Double(model.restTotal)))
  }

  /// The countdown pulses at ~1 Hz in the final 10 s. Driven by a repeating
  /// opacity animation rather than a timer so it stays in step with the tick.
  @State private var pulsing = false

  var body: some View {
    VStack(spacing: 0) {
      tierOne
      tierTwo
    }
    .background(bannerFill, in: RoundedRectangle(cornerRadius: 20))
    .overlay(
      RoundedRectangle(cornerRadius: 20).stroke(bannerBorder, lineWidth: 1)
    )
    // Clip so the progress line's square end tucks under the 20pt corner.
    .clipShape(RoundedRectangle(cornerRadius: 20))
    .overlay(alignment: .bottomLeading) { progressLine }
    .onAppear { syncPulse(model.restFinal) }
    .onChange(of: model.restFinal) { _, on in syncPulse(on) }
  }

  // MARK: Tiers

  private var tierOne: some View {
    HStack(alignment: .center, spacing: 10) {
      HStack(alignment: .lastTextBaseline, spacing: 6) {
        Text("REST")
          .font(Ischys.mono(9)).tracking(1.8)
          .foregroundStyle(Ischys.accent)
        Text(Ischys.clock(model.restRemaining))
          .font(Ischys.mono(23, .semibold)).monospacedDigit()
          .tracking(-0.4)
          .foregroundStyle(model.restFinal ? Ischys.accent : Ischys.text1)
          .opacity(model.restFinal && pulsing ? 0.5 : 1)
      }
      .fixedSize()

      VStack(alignment: .trailing, spacing: 1) {
        Text("NEXT")
          .font(Ischys.mono(8.5)).tracking(1.5)
          .foregroundStyle(Ischys.text3)
        Text(model.nextSetLabel)
          .font(Ischys.ui(11.5, .semibold))
          .foregroundStyle(Ischys.text2)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      .frame(maxWidth: .infinity, alignment: .trailing)
    }
    .padding(.horizontal, 12)
    .padding(.top, 9)
    .padding(.bottom, 5)
  }

  private var tierTwo: some View {
    HStack(spacing: 6) {
      Button {
        PhoneLink.shared.adjustRest(-15)
      } label: {
        stepLabel("−15")
      }
      .buttonStyle(.plain)

      Button {
        PhoneLink.shared.skipRest()
      } label: {
        // Final 10 s: Skip reads "Start set" — the rest is effectively over.
        Text(model.restFinal ? "Start set" : "Skip")
          .font(Ischys.ui(14, .bold))
          .foregroundStyle(Ischys.accentFg)
          .frame(maxWidth: .infinity)
          .frame(height: 42)
          .background(Ischys.accent, in: RoundedRectangle(cornerRadius: 13))
      }
      .buttonStyle(.plain)

      Button {
        PhoneLink.shared.adjustRest(15)
      } label: {
        stepLabel("+15")
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 10)
    .padding(.bottom, 10)
  }

  private func stepLabel(_ text: String) -> some View {
    Text(text)
      .font(Ischys.mono(12.5, .semibold))
      .foregroundStyle(Ischys.text1)
      .frame(width: 46, height: 42)
      .background(Ischys.surface2, in: RoundedRectangle(cornerRadius: 13))
      .overlay(RoundedRectangle(cornerRadius: 13).stroke(Ischys.border, lineWidth: 1))
  }

  private var progressLine: some View {
    GeometryReader { geo in
      Rectangle()
        .fill(Ischys.accent)
        .frame(width: geo.size.width * progress, height: 2)
        .frame(maxHeight: .infinity, alignment: .bottom)
    }
    .frame(height: 2)
    .allowsHitTesting(false)
  }

  // MARK: Final-10s treatment

  // The base surface is pinned by the board (banner #131316, warm #17130F in the
  // final stretch). No Theme token matches either, so — like the ring track in the
  // old RestView (`Ischys.hex(0x1C1C20)`) — they're `Ischys.hex`, not raw colours.
  // Worth promoting to tokens if the scale is extended.
  private var bannerFill: Color {
    model.restFinal ? Ischys.hex(0x17130F) : Ischys.hex(0x131316)
  }

  private var bannerBorder: Color {
    model.restFinal ? Ischys.accent.opacity(0.42) : Ischys.border
  }

  private func syncPulse(_ on: Bool) {
    pulsing = false
    guard on, !reduceMotion else { return }
    withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
      pulsing = true
    }
  }
}
