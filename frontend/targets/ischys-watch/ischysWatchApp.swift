import HealthKit
import SwiftUI

@main
struct IschysWatchApp: App {
  @WKApplicationDelegateAdaptor(AppDelegate.self) var delegate
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(WorkoutModel.shared)
    }
    .onChange(of: scenePhase) { _, phase in
      // Ask for HealthKit access every time we reach the foreground, not only at
      // launch (see AppDelegate). The phone starts our workout via startWatchApp,
      // which can launch us in the background — and watchOS suppresses the
      // permission prompt there. A launch-only request means a user who never
      // opens the watch app by hand is never asked, so heart rate silently reads
      // 0 until they dig into Settings. HealthKit ignores the repeat once answered.
      if phase == .active { WorkoutManager.shared.requestAuthorization() }
    }
  }
}

/// Boots the connectivity + HealthKit auth, and handles the phone launching us
/// into a workout (`HKHealthStore.startWatchApp`, enabled by
/// WKBackgroundModes: workout-processing in Info.plist).
final class AppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    WorkoutManager.shared.requestAuthorization()
    // Clear any session orphaned by a prior app process before it burns calories
    // forever and blocks the next workout from starting.
    WorkoutManager.shared.recoverActiveSession()
    // Before the link: the delegate has to be in place before a forwarded
    // notification can arrive.
    RestAlertMute.shared.install()
    PhoneLink.shared.activate()
  }

  func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    WorkoutManager.shared.start(with: workoutConfiguration)
  }
}

/// Top-level router. Pure black background everywhere, per the design.
struct RootView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    ZStack {
      Ischys.bg.ignoresSafeArea()
      switch model.screen {
      case .start:
        StartView()
      case .session:
        SessionView()
      case .summary:
        SummaryView()
      }
    }
    .tint(Ischys.accent)
  }
}

/// The paged workout: Active Set ⇄ Metrics ⇄ Controls (native `.page` tabs).
///
/// Rest is a non-blocking banner pinned above the pager — chrome, not a page — so
/// all three screens stay swipeable while resting (the hands-busy moment is the
/// worst time to force a navigation). It enters and exits from the bottom edge,
/// the same path the old full-screen `RestView` overlay used. Its 2px accent
/// progress line replaces that overlay's 116pt ring as the glanceable read.
struct SessionView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    ZStack(alignment: .bottom) {
      TabView {
        ActiveSetView()
        MetricsView()
        ControlsView()
      }
      .tabViewStyle(.page)

      if model.resting {
        RestBanner()
          // left/right 10 per the board; lifted clear of the page dots (bottom 10).
          .padding(.horizontal, 10)
          .padding(.bottom, 20)
          .transition(.move(edge: .bottom))
      }

      // Last, so it sits over the pages and the rest banner alike while a
      // finish is in flight or has just failed.
      FinishStatusView()
    }
    .animation(.easeInOut(duration: 0.2), value: model.resting)
  }
}
