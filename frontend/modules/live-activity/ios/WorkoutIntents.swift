import AppIntents
import Foundation

// ⚠️ Compiled into BOTH the app (via modules/live-activity) and the widget
// extension. `npm run lint:la` keeps the copies byte-identical.
//
// These conform to `LiveActivityIntent`, so the system runs them in the APP's
// process, not the extension's — which is the whole reason the buttons can
// reach workout state. The type must exist in both targets; the app's copy is
// the one that executes.

@available(iOS 17.0, *)
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Skip rest"
  static var description = IntentDescription("Ends the current rest timer.")

  func perform() async throws -> some IntentResult {
    await LiveActivityMutator.skipRest()
    LiveActivityActionQueue.append(.skipRest)
    LiveActivityNotifier.post()
    return .result()
  }
}

@available(iOS 17.0, *)
struct AdjustRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Adjust rest"
  static var description = IntentDescription("Adds or removes rest time.")

  @Parameter(title: "Seconds")
  var seconds: Int

  init() {}
  init(seconds: Int) { self.seconds = seconds }

  func perform() async throws -> some IntentResult {
    await LiveActivityMutator.adjustRest(by: seconds)
    LiveActivityActionQueue.append(.adjustRest, seconds: seconds)
    LiveActivityNotifier.post()
    return .result()
  }
}

@available(iOS 17.0, *)
struct CompleteSetIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Complete set"
  static var description = IntentDescription("Logs the current set and starts rest.")

  @Parameter(title: "Set id")
  var setId: String

  init() {}
  init(setId: String) { self.setId = setId }

  func perform() async throws -> some IntentResult {
    // Redraws the card from `next`, which JS supplied. The API write — carry-
    // forward, the PATCH, starting the real rest — still happens in JS, so no
    // bearer token and no set-writing logic lives in the extension.
    await LiveActivityMutator.completeSet(setId)
    LiveActivityActionQueue.append(.completeSet, setId: setId)
    LiveActivityNotifier.post()
    return .result()
  }
}
