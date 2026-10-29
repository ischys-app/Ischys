import SwiftUI

/// Another profile is active on the phone, and Health and the Watch are the
/// owner's alone. One centred message, no buttons; a long name wraps.
struct OffView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "heart.fill")
        .font(.system(size: 22 * Ischys.scale))
        .foregroundStyle(Ischys.text3)
      Text(WatchScreen.offTitle(profileName: model.profileName))
        .font(Ischys.ui(15))
        .foregroundStyle(Ischys.text1)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.horizontal, 12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .onAppear {
      // The way back to Start is the phone saying the owner is back. Ask, as
      // StartView does, rather than wait for a push that may never come: a
      // relaunch onto this screen, say, with the phone app since reopened.
      PhoneLink.shared.requestState()
    }
  }
}
