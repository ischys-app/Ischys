import HealthKit
import SwiftUI

@main
struct IschysWatchApp: App {
  @WKApplicationDelegateAdaptor(AppDelegate.self) var delegate

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(WorkoutModel.shared)
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

/// The paged workout: Active Set ⇄ Metrics ⇄ Controls (native `.page` tabs),
/// with Rest presented over the top while resting — matching the native Workout
/// app's horizontal pages and the design's S2/S3/S4/S5 flow.
struct SessionView: View {
  @EnvironmentObject var model: WorkoutModel

  var body: some View {
    TabView {
      ActiveSetView()
      MetricsView()
      ControlsView()
    }
    .tabViewStyle(.page)
    .overlay {
      if model.resting {
        RestView()
          .transition(.move(edge: .bottom))
      }
    }
    .animation(.easeInOut(duration: 0.2), value: model.resting)
  }
}
