import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Design tokens

/// Hex literals from `Live Activity.dc.html` stay reviewable here.
private extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}

private enum LA {
  static let accent = Color(hex: 0xFF4A1C)
  static let accentFg = Color(hex: 0x0B0B0C)
  static let bg = Color(hex: 0x0A0A0B)

  /// The HTML card is ~187pt tall; the Lock Screen presentation caps at ~160pt.
  /// Over budget, iOS compresses the outer padding away — measured on device as
  /// ~4pt above the header and ~3pt below the controls, against the design's 15
  /// and 17. So we spend the budget deliberately instead of letting the system
  /// take it: font sizes, the 46pt thumbnail and the 44pt controls are the
  /// design's identity and stay exact; the vertical padding absorbs the 27pt.
  ///
  /// Rest state (the taller of the two) now totals ~158pt:
  ///   header 9+19 · exercise 7+46+9 · bar 2+4 · controls 8+44+10
  static let cardTop: CGFloat = 9
  static let cardBottom: CGFloat = 10
  static let controlsTop: CGFloat = 8
}

// MARK: - Live Activity

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutAttributes.self) { context in
      LockScreenCard(context: context)
        .activityBackgroundTint(Color.black)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.exerciseName)
            .font(.custom("SpaceGrotesk-SemiBold", size: 18))
            .lineLimit(1)
        }
      } compactLeading: {
        Circle()
          .fill(LA.accent)
          .frame(width: 6, height: 6)
      } compactTrailing: {
        Text(context.attributes.workoutStartedAt, style: .relative)
          .font(.custom("JetBrainsMono-Regular", size: 13.5))
          .monospacedDigit()
          .lineLimit(1)
      } minimal: {
        Circle()
          .fill(LA.accent)
          .frame(width: 6, height: 6)
      }
    }
    // Hands every edge to us rather than WidgetKit, which matters because the
    // card runs right up against the height ceiling — see the LA token block.
    .contentMarginsDisabled()
  }
}

// MARK: - Lock Screen card

/// The system draws the card container (rounded rect, 26pt radius, hairline
/// border) on the Lock Screen. This view is only the content stack; the card
/// fill/foreground come from `.activityBackgroundTint` / action-foreground on
/// the `ActivityConfiguration`.
private struct LockScreenCard: View {
  let context: ActivityViewContext<WorkoutAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      exerciseRow

      if context.state.mode == "rest" {
        restBody
      } else {
        loggingBody
      }
    }
  }

  // MARK: Logging state
  //
  // HTML: row `padding: 15px 17px 17px` · `gap: 12px` · `align-items: center`,
  // preceded by a full-card-width `border-top: 1px solid rgba(255,255,255,0.08)`.
  private var loggingBody: some View {
    VStack(alignment: .leading, spacing: 0) {
      // border-top spans the whole card (NOT inset by the row's 17pt padding).
      Rectangle()
        .fill(.white.opacity(0.08))
        .frame(height: 1)

      HStack(alignment: .center, spacing: 12) {
        // `154 kg × 12 reps` — one JetBrainsMono run with the `×` dimmed.
        (
          Text(context.state.weightLabel)
            + Text(" × ").foregroundStyle(.white.opacity(0.5))
            + Text(context.state.repsLabel)
        )
        .font(.custom("JetBrainsMono-SemiBold", size: 25))
        .monospacedDigit()
        .tracking(-0.5)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)

        // 46×40 accent chip with the inline ✓ SVG.
        Button(intent: CompleteSetIntent(setId: context.state.setId ?? "")) {
          CheckmarkPath()
            .stroke(style: StrokeStyle(lineWidth: 3.2, lineCap: .round, lineJoin: .round))
            .foregroundStyle(LA.accentFg)
            .frame(width: 20, height: 20)
            .frame(width: 46, height: 40)
            .background(RoundedRectangle(cornerRadius: 11).fill(LA.accent))
        }
        .buttonStyle(.plain)
        .disabled(context.state.setId == nil)
      }
      .padding(.top, 12)
      .padding(.horizontal, 17)
      .padding(.bottom, LA.cardBottom)
    }
  }

  // MARK: Rest state
  //
  // HTML: a 4pt track `margin: 2px 17px 0` with an accent fill, then a control
  // row `padding: 13px 17px 17px` · `gap: 10px` · `align-items: center`.
  // Countdown + bar tick on-device via `timerInterval:` — no Timer, no pushes.
  // The buttons are LiveActivityIntents, which the system runs in the app's
  // process; JS applies them and pushes the resulting state back.
  private var restBody: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let start = context.state.restStartedAt, let end = context.state.restEndsAt {
        ProgressView(timerInterval: start...end, countsDown: true)
          .progressViewStyle(.linear)
          .tint(LA.accent)
          .labelsHidden()
          .frame(height: 4)
          .padding(.top, 2)
          .padding(.horizontal, 17)
      }

      HStack(alignment: .center, spacing: 10) {
        Button(intent: AdjustRestIntent(seconds: -15)) { restPill("−15s") }
          .buttonStyle(.plain)

        if let start = context.state.restStartedAt, let end = context.state.restEndsAt {
          Text(timerInterval: start...end, countsDown: true)
            .font(.custom("JetBrainsMono-SemiBold", size: 24))
            .monospacedDigit()
            .tracking(-0.5)
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        } else {
          Spacer(minLength: 0)
        }

        Button(intent: AdjustRestIntent(seconds: 15)) { restPill("+15s") }
          .buttonStyle(.plain)

        // Skip — accent, Space Grotesk Bold, wider horizontal padding.
        Button(intent: SkipRestIntent()) {
          Text("Skip")
            .font(.custom("SpaceGrotesk-Bold", size: 15))
            .foregroundStyle(LA.accentFg)
            .frame(height: 44)
            .padding(.horizontal, 20)
            .background(RoundedRectangle(cornerRadius: 12).fill(LA.accent))
        }
        .buttonStyle(.plain)
      }
      .padding(.top, LA.controlsTop)
      .padding(.horizontal, 17)
      .padding(.bottom, LA.cardBottom)
    }
  }

  // −15s / +15s adjust pills: `height: 44`, `padding: 0 16px`, radius 12,
  // `rgba(255,255,255,0.12)`, JetBrainsMono-SemiBold 14, white.
  private func restPill(_ label: String) -> some View {
    Text(label)
      .font(.custom("JetBrainsMono-SemiBold", size: 14))
      .monospacedDigit()
      .foregroundStyle(.white)
      .frame(height: 44)
      .padding(.horizontal, 16)
      .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.12)))
  }

  // Header row: `padding: 15px 17px 0` · `gap: 8px` · `align-items: center`.
  private var header: some View {
    HStack(alignment: .center, spacing: 8) {
      // "Ischys" + 4×4 accent dot · `gap: 2px` · `align-items: baseline`.
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text("Ischys")
          .font(.custom("SpaceGrotesk-Bold", size: 15))
          .tracking(-0.4)
          .foregroundStyle(.white.opacity(0.95))
        Circle()
          .fill(LA.accent)
          .frame(width: 4, height: 4)
      }

      Text("Workout")
        .font(.custom("SpaceGrotesk-Medium", size: 15))
        .foregroundStyle(.white.opacity(0.5))

      Spacer(minLength: 0)

      // The design's "48 sec". Rendered from the start Date rather than a
      // pushed string, so it keeps counting while the app is suspended.
      Text(context.attributes.workoutStartedAt, style: .relative)
        .font(.custom("JetBrainsMono-Regular", size: 13.5))
        .monospacedDigit()
        .foregroundStyle(.white.opacity(0.5))
        .lineLimit(1)
    }
    .padding(.top, LA.cardTop)
    .padding(.horizontal, 17)
  }

  // Exercise row: `padding: 12px 17px 15px` · `gap: 13px` · `align-items: center`.
  private var exerciseRow: some View {
    HStack(alignment: .center, spacing: 13) {
      // 46×46 image slot, radius 12. No bundled image yet → white placeholder.
      RoundedRectangle(cornerRadius: 12)
        .fill(Color.white)
        .frame(width: 46, height: 46)

      VStack(alignment: .leading, spacing: 2) {
        Text(context.state.exerciseName)
          .font(.custom("SpaceGrotesk-SemiBold", size: 18))
          .tracking(-0.3)
          .foregroundStyle(.white)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)

        Text(context.state.subtitle)
          .font(.custom("SpaceGrotesk-Regular", size: 14.5))
          .foregroundStyle(.white.opacity(0.5))
      }
    }
    .padding(.top, 7)
    .padding(.horizontal, 17)
    .padding(.bottom, 9)
  }
}

// MARK: - Checkmark glyph
//
// The ✓ from the HTML: `viewBox 0 0 24 24`, `path d="M20 6L9 17l-5-5"`. Mapped
// from the 24×24 viewBox into whatever frame the shape is given, so the geometry
// matches the SVG rather than SF Symbols' `checkmark`.
private struct CheckmarkPath: Shape {
  func path(in rect: CGRect) -> Path {
    let sx = rect.width / 24
    let sy = rect.height / 24
    var path = Path()
    path.move(to: CGPoint(x: 20 * sx, y: 6 * sy))
    path.addLine(to: CGPoint(x: 9 * sx, y: 17 * sy))
    path.addLine(to: CGPoint(x: 4 * sx, y: 12 * sy))
    return path
  }
}
