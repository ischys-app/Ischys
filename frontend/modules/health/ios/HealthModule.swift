import ExpoModulesCore
import HealthKit
import WatchConnectivity

/// Bridges Ischys and Apple Health.
///
/// Writing: saves a finished workout as an HKWorkout so it shows in Fitness, and
/// replaces that entry when the workout's date or duration is edited later
/// (`WorkoutEntries`). An entry the Watch recorded is never altered.
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
  /// Ischys's own workouts in Health: saving, finding and replacing them.
  private lazy var entries = WorkoutEntries(store: store)
  private var hrQuery: HKQuery?

  private var hrType: HKQuantityType? { HKObjectType.quantityType(forIdentifier: .heartRate) }
  private var energyType: HKQuantityType? {
    HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
  }
  private var bodyMassType: HKQuantityType? { HKObjectType.quantityType(forIdentifier: .bodyMass) }
  private let bpmUnit = HKUnit.count().unitDivided(by: .minute())

  public func definition() -> ModuleDefinition {
    Name("Health")
    // onHeartRate: HealthKit-read live HR (no Watch app). onWatchMetrics: real-time
    // HR/energy streamed from the Ischys Watch app. onWatchAction: a control the
    // user tapped on the Watch (log set, rest, end…), applied by JS.
    Events("onHeartRate", "onWatchMetrics", "onWatchAction")

    /// Drains the Watch actions that arrived before JS was listening.
    ///
    /// `sendEvent` reaches whoever is subscribed at that instant and nobody
    /// afterwards. WCSession activates in `OnCreate` — while the JS bundle is
    /// still evaluating — so a queued `transferUserInfo`, which iOS delivers the
    /// moment the app launches, can land before the root layout has subscribed.
    /// For a "log set" that costs one tap; for a finish it left the workout stuck
    /// active on the phone after the user ended it on the wrist. So completing
    /// actions are buffered whenever there is no listener, and the root layout
    /// drains them on mount.
    AsyncFunction("consumeWatchActions") { () -> [[String: Any]] in
      PhoneConnectivity.shared.drainPendingActions()
    }

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
      if let bodyMassType {
        read.insert(bodyMassType)
      }
      // Waist and body fat are the only body measurements HealthKit has types
      // for; the rest of the measurement list is ours alone. Read-only —
      // neither is ever written back.
      if let waist = HKObjectType.quantityType(forIdentifier: .waistCircumference) {
        read.insert(waist)
      }
      if let fat = HKObjectType.quantityType(forIdentifier: .bodyFatPercentage) {
        read.insert(fat)
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
    ///
    /// Resolves the saved HKWorkout's UUID, which is what lets an edit to the
    /// workout's time find this entry again (`replaceWorkout`), or null when
    /// nothing was saved.
    AsyncFunction("saveWorkout") { (startMs: Double, endMs: Double, energyKcal: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(nil)
        return
      }
      let start = Date(timeIntervalSince1970: startMs / 1000)
      let end = Date(timeIntervalSince1970: endMs / 1000)
      guard end > start else {
        promise.resolve(nil)
        return
      }
      Task {
        do {
          let workout = try await self.entries.save(start: start, end: end, energyKcal: energyKcal)
          promise.resolve(workout?.uuid.uuidString as Any?)
        } catch {
          promise.reject("E_HEALTH_SAVE", error.localizedDescription)
        }
      }
    }

    /// Whether Ischys has ALREADY put a strength HKWorkout over [startMs, endMs].
    ///
    /// The Watch is the primary writer when it recorded the session, and it
    /// confirms the save over WatchConnectivity so the phone knows to stand down.
    /// That confirmation is not reliable enough to be the only signal: with the
    /// phone app not frontmost it falls back to `transferUserInfo`, which is
    /// queued for the phone's next run — long after the phone has given up
    /// waiting and written its own copy. Asking HealthKit is authoritative.
    ///
    /// The matching rules — only Ischys's own entries, from either half of the
    /// pair, covering most of the window — are `WorkoutEntries.find`. Finding
    /// nothing resolves false, so the caller writes: erring toward a rare
    /// duplicate beats losing a finished workout.
    AsyncFunction("hasWorkout") { (startMs: Double, endMs: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      let start = Date(timeIntervalSince1970: startMs / 1000)
      let end = Date(timeIntervalSince1970: endMs / 1000)
      Task {
        let entry = await self.entries.find(start: start, end: end)
        promise.resolve(entry != nil)
      }
    }

    /// Ischys's strength HKWorkout over [startMs, endMs], by the same rules as
    /// `hasWorkout`: its uuid, start and end (epoch ms), energy (kcal), the
    /// bundle id that wrote it, and `writer` — "phone" or "watch". Null when
    /// there is none.
    AsyncFunction("findWorkout") { (startMs: Double, endMs: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(nil)
        return
      }
      let start = Date(timeIntervalSince1970: startMs / 1000)
      let end = Date(timeIntervalSince1970: endMs / 1000)
      Task {
        let entry = await self.entries.find(start: start, end: end)
        promise.resolve(entry?.payload as Any?)
      }
    }

    /// Whether iOS lets Ischys write workouts. Write access is the one grant
    /// HealthKit discloses, so false here is a real "no".
    Function("canWriteWorkouts") { () -> Bool in
      HKHealthStore.isHealthDataAvailable() && self.entries.canWriteWorkouts
    }

    /// Moves an entry the PHONE wrote to [startMs, endMs]: deletes it by UUID
    /// and saves a new one over the new window, carrying its energy over.
    ///
    /// Resolves `{ status }`: "replaced" (with the new `uuid`), "missing" (no
    /// such entry any more), "notOurs" (the entry is not one the phone wrote —
    /// a Watch recording is never deleted or altered), "denied" (not authorised
    /// to write workouts), "failed", or "unavailable". Never rejects.
    AsyncFunction("replaceWorkout") { (uuid: String, startMs: Double, endMs: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(["status": "unavailable"])
        return
      }
      guard let id = UUID(uuidString: uuid) else {
        promise.resolve(["status": "missing"])
        return
      }
      let start = Date(timeIntervalSince1970: startMs / 1000)
      let end = Date(timeIntervalSince1970: endMs / 1000)
      Task {
        let outcome = await self.entries.replace(uuid: id, start: start, end: end)
        promise.resolve(outcome.payload)
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

    /// The user's most recent body-mass sample, in kilograms — used to pull their
    /// bodyweight from Health so bodyweight movements can count toward volume.
    /// Resolves null when Health is unavailable, the type is missing, read access
    /// was denied (HealthKit reports that as no data), or nothing was ever logged.
    /// Latest waist circumference and body-fat percentage, with the sample's
    /// uuid and date so the caller can upsert rather than append a duplicate on
    /// every sync. Read-only: Ischys never writes these back to Health.
    ///
    /// Only these two — they are the only body measurements HealthKit has a
    /// type for. Arms, thighs and the rest are ours alone, which is why the
    /// Health screen says "waist and body fat" rather than "measurements".
    AsyncFunction("readBodyMeasurements") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve([:] as [String: Any])
        return
      }
      let waistType = HKObjectType.quantityType(forIdentifier: .waistCircumference)
      let fatType = HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)
      var out: [String: Any] = [:]
      let group = DispatchGroup()

      func latest(_ type: HKQuantityType?, key: String, unit: HKUnit, scale: Double) {
        guard let type else { return }
        group.enter()
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: sort) {
          _, samples, _ in
          if let s = samples?.first as? HKQuantitySample {
            out[key] = [
              "value": s.quantity.doubleValue(for: unit) * scale,
              "measuredAt": s.endDate.timeIntervalSince1970 * 1000,
              "uuid": s.uuid.uuidString,
            ]
          }
          group.leave()
        }
        self.store.execute(query)
      }

      // Canonical units: centimetres, and percent as 0-100 rather than 0-1.
      latest(waistType, key: "waist", unit: .meterUnit(with: .centi), scale: 1)
      latest(fatType, key: "bodyFat", unit: .percent(), scale: 100)

      group.notify(queue: .main) { promise.resolve(out) }
    }

    AsyncFunction("readBodyMass") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable(), let bodyMassType = self.bodyMassType else {
        promise.resolve(nil)
        return
      }
      let sort = [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
      let query = HKSampleQuery(
        sampleType: bodyMassType, predicate: nil, limit: 1, sortDescriptors: sort
      ) { _, samples, _ in
        guard let sample = samples?.first as? HKQuantitySample else {
          promise.resolve(nil)
          return
        }
        let kg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
        promise.resolve(kg)
      }
      self.store.execute(query)
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
          // Buffered instead of emitted when JS isn't listening yet, so a finish
          // can't be dropped into the void. Everything else emits as before.
          if PhoneConnectivity.shared.bufferIfUnheard(payload) { return }
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

  /// Actions that end a workout. Losing one of these strands the workout as
  /// active on the phone after the user finished it on the wrist, and nothing
  /// re-sends it — so these, and only these, are worth buffering.
  private static let completingActions: Set<String> = ["end", "discard"]

  private let pendingLock = NSLock()
  private var pendingActions: [[String: Any]] = []
  /// False until JS first drains, which is the only proof a listener exists.
  private var jsListening = false

  /// Hands JS the buffered actions and marks it live, so later ones are emitted
  /// rather than queued. Called once from the root layout on mount.
  func drainPendingActions() -> [[String: Any]] {
    pendingLock.lock()
    defer { pendingLock.unlock() }
    jsListening = true
    let drained = pendingActions
    pendingActions = []
    return drained
  }

  /// Buffers a workout-ending action that arrived before JS could hear it.
  /// Returns true when it was buffered, meaning the caller must NOT also emit —
  /// emitting as well would let a listener that subscribed in between apply the
  /// finish twice.
  func bufferIfUnheard(_ payload: [String: Any]) -> Bool {
    guard let action = payload["action"] as? String,
          Self.completingActions.contains(action) else { return false }
    pendingLock.lock()
    defer { pendingLock.unlock() }
    guard !jsListening else { return false }
    pendingActions.append(payload)
    return true
  }

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
