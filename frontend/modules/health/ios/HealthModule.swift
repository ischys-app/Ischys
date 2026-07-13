import ExpoModulesCore
import HealthKit
import WatchConnectivity

/// Bridges Ischys and Apple Health.
///
/// Writing: saves a finished workout as an HKWorkout so it shows in Fitness.
///
/// Reading: the iPhone has no heart-rate sensor, so live HR comes from an Apple
/// Watch running a workout session and streaming samples into HealthKit. This
/// reads those samples — live during the workout, and as avg/max/energy
/// aggregates when it ends.
///
/// Starting: `startWatchWorkout` launches the Ischys Watch app and begins its
/// session, so the user need not touch the Watch. `stopWatchWorkout` ends it over
/// WatchConnectivity when they finish on the phone.
public class HealthModule: Module {
  private let store = HKHealthStore()
  private var hrQuery: HKQuery?

  private var hrType: HKQuantityType? { HKObjectType.quantityType(forIdentifier: .heartRate) }
  private var energyType: HKQuantityType? {
    HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
  }
  private let bpmUnit = HKUnit.count().unitDivided(by: .minute())

  public func definition() -> ModuleDefinition {
    Name("Health")
    // onHeartRate: HealthKit-read live HR (no Watch app). onWatchMetrics: real-time
    // HR/energy streamed from the Ischys Watch app. onWatchAction: a control the
    // user tapped on the Watch (log set, rest, end…), applied by JS.
    Events("onHeartRate", "onWatchMetrics", "onWatchAction")

    Function("isAvailable") { () -> Bool in
      HKHealthStore.isHealthDataAvailable()
    }

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      var share: Set<HKSampleType> = [HKObjectType.workoutType()]
      var read: Set<HKObjectType> = [HKObjectType.workoutType()]
      if let energyType {
        share.insert(energyType)
        read.insert(energyType)
      }
      if let hrType {
        read.insert(hrType)
      }
      self.store.requestAuthorization(toShare: share, read: read) { granted, error in
        if let error {
          promise.reject("E_HEALTH_AUTH", error.localizedDescription)
        } else {
          promise.resolve(granted)
        }
      }
    }

    /// Saves one strength-training workout spanning [startMs, endMs], optionally
    /// with the active energy read for that window. JS passes epoch milliseconds.
    AsyncFunction("saveWorkout") { (startMs: Double, endMs: Double, energyKcal: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      let start = Date(timeIntervalSince1970: startMs / 1000)
      let end = Date(timeIntervalSince1970: endMs / 1000)
      guard end > start else {
        promise.resolve(false)
        return
      }

      let config = HKWorkoutConfiguration()
      // Traditional = weights/machines (what Ischys logs). Functional would be
      // kettlebell/bodyweight movement work; wrong for a barbell app.
      config.activityType = .traditionalStrengthTraining

      let builder = HKWorkoutBuilder(healthStore: self.store, configuration: config, device: .local())
      builder.beginCollection(withStart: start) { began, error in
        if let error {
          promise.reject("E_HEALTH_SAVE", error.localizedDescription)
          return
        }
        guard began else {
          promise.resolve(false)
          return
        }

        // Attach energy the Watch measured, so Fitness shows calories rather
        // than a blank. Nothing is fabricated — energyKcal is a HealthKit sum,
        // and a zero (no Watch) simply adds no sample.
        let addEnergy: (@escaping () -> Void) -> Void = { done in
          guard energyKcal > 0, let energyType = self.energyType else {
            done()
            return
          }
          let quantity = HKQuantity(unit: .kilocalorie(), doubleValue: energyKcal)
          let sample = HKCumulativeQuantitySample(
            type: energyType, quantity: quantity, start: start, end: end
          )
          builder.add([sample]) { _, _ in done() }
        }

        addEnergy {
          builder.endCollection(withEnd: end) { ended, error in
            if let error {
              promise.reject("E_HEALTH_SAVE", error.localizedDescription)
              return
            }
            guard ended else {
              promise.resolve(false)
              return
            }
            builder.finishWorkout { workout, error in
              if let error {
                promise.reject("E_HEALTH_SAVE", error.localizedDescription)
              } else {
                promise.resolve(workout != nil)
              }
            }
          }
        }
      }
    }

    /// Aggregates for a finished workout: average and max heart rate (bpm) and
    /// total active energy (kcal) over [startMs, endMs]. Any field is null when
    /// HealthKit holds no samples for it — i.e. no Watch was recording.
    AsyncFunction("readWorkoutMetrics") { (startMs: Double, endMs: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable(), let hrType = self.hrType else {
        promise.resolve(["avgHr": nil, "maxHr": nil, "energyKcal": nil] as [String: Any?])
        return
      }
      let start = Date(timeIntervalSince1970: startMs / 1000)
      let end = Date(timeIntervalSince1970: endMs / 1000)
      let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

      var avgHr: Int?
      var maxHr: Int?
      var energyKcal: Double?
      let group = DispatchGroup()

      group.enter()
      let hrQuery = HKStatisticsQuery(
        quantityType: hrType,
        quantitySamplePredicate: predicate,
        options: [.discreteAverage, .discreteMax]
      ) { _, stats, _ in
        if let avg = stats?.averageQuantity()?.doubleValue(for: self.bpmUnit) {
          avgHr = Int(avg.rounded())
        }
        if let mx = stats?.maximumQuantity()?.doubleValue(for: self.bpmUnit) {
          maxHr = Int(mx.rounded())
        }
        group.leave()
      }
      self.store.execute(hrQuery)

      if let energyType = self.energyType {
        group.enter()
        let eQuery = HKStatisticsQuery(
          quantityType: energyType,
          quantitySamplePredicate: predicate,
          options: .cumulativeSum
        ) { _, stats, _ in
          if let sum = stats?.sumQuantity()?.doubleValue(for: .kilocalorie()) {
            energyKcal = sum
          }
          group.leave()
        }
        self.store.execute(eQuery)
      }

      group.notify(queue: .main) {
        promise.resolve([
          "avgHr": avgHr as Any?,
          "maxHr": maxHr as Any?,
          "energyKcal": energyKcal as Any?,
        ] as [String: Any?])
      }
    }

    /// Starts streaming heart-rate samples as they land in HealthKit, emitting
    /// `onHeartRate` with the latest bpm. Only produces values while an Apple
    /// Watch is recording a workout; otherwise it is silent, which is honest —
    /// no Watch, no number.
    Function("startHeartRateUpdates") {
      guard HKHealthStore.isHealthDataAvailable(), let hrType = self.hrType else { return }
      self.stopHR()

      // Only samples from now on; a workout's history is read via readWorkoutMetrics.
      let predicate = HKQuery.predicateForSamples(withStart: Date(), end: nil, options: .strictStartDate)
      let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = {
        [weak self] _, samples, _, _, _ in
        self?.emitLatestHeartRate(samples)
      }
      let query = HKAnchoredObjectQuery(
        type: hrType, predicate: predicate, anchor: nil, limit: HKObjectQueryNoLimit, resultsHandler: handler
      )
      query.updateHandler = handler
      self.hrQuery = query
      self.store.execute(query)
    }

    Function("stopHeartRateUpdates") {
      self.stopHR()
    }

    OnCreate {
      PhoneConnectivity.shared.onMessage = { [weak self] payload in
        if payload["metrics"] as? Bool == true {
          self?.sendEvent("onWatchMetrics", [
            "bpm": payload["hr"] as? Int ?? 0,
            "cal": payload["cal"] as? Int ?? 0,
          ])
        } else if payload["action"] is String {
          self?.sendEvent("onWatchAction", payload)
        }
      }
      PhoneConnectivity.shared.activate()
    }

    /// Pushes the current workout state to the Watch (coalesced — only the latest
    /// matters). JS serialises the shape PhoneState decodes on the Watch.
    Function("updateWatchState") { (state: [String: Any]) in
      PhoneConnectivity.shared.pushState(state)
    }

    /// Launches the Ischys Watch app and starts its workout session, so the Watch
    /// begins measuring without the user opening anything. Silently does nothing
    /// when there is no paired Watch with the app installed — the phone-only
    /// HealthKit read path still works, the metrics just won't exist.
    Function("startWatchWorkout") {
      guard HKHealthStore.isHealthDataAvailable() else { return }
      let config = HKWorkoutConfiguration()
      config.activityType = .traditionalStrengthTraining
      config.locationType = .indoor
      self.store.startWatchApp(with: config) { _, _ in }
    }

    /// Ends the Watch session when the user finishes/discards on the phone.
    /// `discard` throws the Watch's recording away rather than saving it — without
    /// it, a phone-side discard still left the Watch to write an HKWorkout.
    /// Best-effort: if the Watch is unreachable the session ends at its own End.
    Function("stopWatchWorkout") { (discard: Bool) in
      guard WCSession.isSupported() else { return }
      let session = WCSession.default
      guard session.activationState == .activated else { return }
      let cmd = ["cmd": discard ? "discard" : "stop"]
      // Reachable → send now. Not reachable → queue it: transferUserInfo is
      // delivered FIFO the moment the Watch app next runs, so ending on the phone
      // still ends the Watch session instead of silently dropping the command.
      if session.isReachable {
        session.sendMessage(cmd, replyHandler: nil, errorHandler: nil)
      } else {
        session.transferUserInfo(cmd)
      }
    }

    OnDestroy {
      self.stopHR()
    }
  }

  private func stopHR() {
    if let hrQuery {
      store.stop(hrQuery)
      self.hrQuery = nil
    }
  }

  private func emitLatestHeartRate(_ samples: [HKSample]?) {
    guard
      let latest = samples?.compactMap({ $0 as? HKQuantitySample }).max(by: { $0.endDate < $1.endDate })
    else { return }
    let bpm = Int(latest.quantity.doubleValue(for: bpmUnit).rounded())
    // Events must be delivered on the main queue; HealthKit calls back off it.
    DispatchQueue.main.async { [weak self] in
      self?.sendEvent("onHeartRate", ["bpm": bpm])
    }
  }
}

/// Minimal WCSession owner on the phone. Sending a message requires an activated
/// session with a delegate; iOS additionally requires the two lifecycle stubs
/// below (watchOS does not). This holds no state — it only keeps a session alive
/// so `stopWatchWorkout` can send.
final class PhoneConnectivity: NSObject, WCSessionDelegate {
  static let shared = PhoneConnectivity()

  /// Set by the module: forwards a Watch message (action or metrics) to JS.
  var onMessage: (([String: Any]) -> Void)?

  func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// Latest workout state → the Watch. A foreground Watch app only receives
  /// updates promptly over `sendMessage` — `updateApplicationContext` is delivered
  /// opportunistically and can sit undelivered for minutes while the Watch is
  /// frontmost, which left the Watch stuck on its Start screen (never seeing
  /// `screen: "session"`) even as metrics streamed back over sendMessage. So push
  /// live over sendMessage when reachable, and always refresh the application
  /// context too, so a backgrounded or still-launching Watch gets the newest state
  /// the instant it activates. The context coalesces; rapid updates never queue.
  func pushState(_ state: [String: Any]) {
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    if session.isReachable {
      session.sendMessage(state, replyHandler: nil, errorHandler: nil)
    }
    try? session.updateApplicationContext(state)
  }

  private func forward(_ message: [String: Any]) {
    // Expo events must be emitted on the main queue; WCSession calls back off it.
    DispatchQueue.main.async { self.onMessage?(message) }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    // Re-activate so a switched Watch can still be reached.
    WCSession.default.activate()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    forward(message)
  }

  // transferUserInfo fallback the Watch uses for actions when unreachable.
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    forward(userInfo)
  }

  // applicationContext fallback the Watch uses for live metrics when this app is
  // not reachable (wrist down / backgrounded) — carries the newest HR, so the
  // pulse resumes updating the moment the phone app is frontmost again.
  func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    forward(context)
  }
}
