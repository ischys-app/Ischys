import SwiftUI

/// S3 — Rest. A shrinking progress ring counts the phone-owned rest interval
/// down; the Crown-free controls nudge (±15) or skip it. Every edit is sent to
/// the phone, which pushes the corrected rest state straight back — the Watch
/// never mutates the countdown itself (the local 1 Hz tick fills between pushes).
struct RestView: View {
  @EnvironmentObject var model: WorkoutModel

  /// Fraction of the interval still remaining, 0…1. The ring shrinks as it runs.
  private var progress: Double {
    model.restTotal > 0 ? Double(model.restRemaining) / Double(model.restTotal) : 0
  }

  var body: some View {
    // Opaque black behind the content: this is presented as an overlay over the
    // Active Set, so without its own fill the set's weight × reps show through.
    ZStack {
      Ischys.bg.ignoresSafeArea()
      // No top clock: watchOS shows the system time top-right, so ours only
      // collided. The ring is the focus; the controls sit clear below it.
      VStack(spacing: 10) {
        Spacer(minLength: 0)
        ring
        Spacer(minLength: 0)
        controls
      }
    }
  }

  private var ring: some View {
    ZStack {
      Circle()
        .stroke(Ischys.hex(0x1C1C20), lineWidth: 14)
      Circle()
        .trim(from: 0, to: progress)
        .stroke(Ischys.accent, style: StrokeStyle(lineWidth: 14, lineCap: .round))
        .rotationEffect(.degrees(-90))
      VStack(spacing: 2) {
        Text("REST")
          .font(Ischys.mono(11)).tracking(2).foregroundStyle(Ischys.accent)
        Text(Ischys.clock(model.restRemaining))
          .font(Ischys.mono(46, .semibold)).monospacedDigit().foregroundStyle(Ischys.text1)
        Text(model.nextSetLabel)
          .font(Ischys.mono(11.5)).foregroundStyle(Ischys.text3)
          .lineLimit(1).minimumScaleFactor(0.8)
      }
    }
    .frame(width: 116, height: 116)
    .padding(.top, 4)
  }

  private var controls: some View {
    HStack(spacing: 6) {
      Button {
        PhoneLink.shared.adjustRest(-15)
      } label: {
        Text("−15")
          .font(Ischys.mono(13, .semibold)).foregroundStyle(Ischys.text1)
          .frame(width: 46, height: 40)
          .background(Ischys.surface2, in: RoundedRectangle(cornerRadius: 16))
          .overlay(RoundedRectangle(cornerRadius: 16).stroke(Ischys.border, lineWidth: 1))
      }
      .buttonStyle(.plain)

      Button {
        PhoneLink.shared.skipRest()
      } label: {
        Text("Skip")
          .font(Ischys.ui(15, .bold)).foregroundStyle(Ischys.accentFg)
          .frame(maxWidth: .infinity)
          .frame(height: 44)
          .background(Ischys.accent, in: RoundedRectangle(cornerRadius: 16))
      }
      .buttonStyle(.plain)

      Button {
        PhoneLink.shared.adjustRest(15)
      } label: {
        Text("+15")
          .font(Ischys.mono(13, .semibold)).foregroundStyle(Ischys.text1)
          .frame(width: 46, height: 40)
          .background(Ischys.surface2, in: RoundedRectangle(cornerRadius: 16))
          .overlay(RoundedRectangle(cornerRadius: 16).stroke(Ischys.border, lineWidth: 1))
      }
      .buttonStyle(.plain)
    }
  }
}
