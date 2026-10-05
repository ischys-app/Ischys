import SwiftUI

/// What covers the session pages around a Finish (#95).
///
/// Finish no longer ends the workout on the spot: the phone is asked, and the
/// Watch keeps recording until it answers (`WorkoutModel.requestFinish`). In
/// between, this says so and keeps the pages underneath from being tapped or
/// swiped — a set logged, or Discard hit, while a finish is in flight has no
/// good meaning. It covers the whole screen, and `SessionView` switches the
/// pages off underneath it for as long as it is up. If the phone could not finish, it says that instead and stays until
/// acknowledged: the wrist has usually dropped by then, and coming back to an
/// ordinary session screen would read as Finish having been ignored.
///
/// Opaque, like every Watch screen here — pure black, Theme tokens only.
struct FinishStatusView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    if model.finishing {
      cover { finishing }
    } else if model.finishFailed {
      // The first that fits the screen's height. The drawn layout is for the
      // 322×394 reference and runs out of room on a 40 mm Watch; the tighter
      // one fits there, and scrolling stands behind both so that nothing is
      // ever clipped.
      cover {
        ViewThatFits(in: .vertical) {
          failed(compact: false)
          failed(compact: true)
          ScrollView { failed(compact: true) }
        }
      }
    }
  }

  private func cover<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    content()
      .padding(.horizontal, 8)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Ischys.bg.ignoresSafeArea())
      // The whole cover is a touch target, edge to edge, so a touch anywhere
      // on it lands on it and not on what is underneath.
      .contentShape(Rectangle())
  }

  private var finishing: some View {
    VStack(spacing: 0) {
      ProgressView()
        .progressViewStyle(.circular)
        .tint(Ischys.accent)
        .frame(width: 62, height: 62)

      Text("Finishing…")
        .font(Ischys.ui(21, .bold))
        .foregroundStyle(Ischys.text1)
        .padding(.top, 12)

      Text("Saving on iPhone")
        .font(Ischys.mono(11.5))
        .foregroundStyle(Ischys.text3)
        .padding(.top, 5)
    }
  }

  private func failed(compact: Bool) -> some View {
    let icon: CGFloat = compact ? 42 : 62
    return VStack(spacing: 0) {
      ZStack {
        Circle().fill(Ischys.error.opacity(0.15))
        Image(systemName: "exclamationmark")
          .font(.system(size: compact ? 19 : 28, weight: .bold))
          .foregroundStyle(Ischys.error)
      }
      .frame(width: icon, height: icon)

      Text("Couldn’t finish")
        .font(Ischys.ui(compact ? 19 : 21, .bold))
        .foregroundStyle(Ischys.text1)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .padding(.top, compact ? 7 : 12)

      Text("Still recording. Try again.")
        .font(Ischys.mono(11.5))
        .foregroundStyle(Ischys.text3)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .padding(.top, compact ? 3 : 5)

      Spacer(minLength: compact ? 8 : 12)

      Button {
        model.finishFailed = false
      } label: {
        Text("Back to workout")
          .font(Ischys.ui(13.5, .semibold))
          .foregroundStyle(Ischys.text2)
          .frame(maxWidth: .infinity)
          .frame(height: compact ? 38 : 44)
          .background(Ischys.surface2, in: RoundedRectangle(cornerRadius: 15))
          .overlay(RoundedRectangle(cornerRadius: 15).stroke(Ischys.border, lineWidth: 1))
      }
      .buttonStyle(.plain)
    }
    .padding(.top, compact ? 0 : 8)
  }
}
