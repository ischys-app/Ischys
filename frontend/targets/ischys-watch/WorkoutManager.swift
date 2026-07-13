import Foundation
import HealthKit

/// Runs the HKWorkoutSession on the Watch. While it runs, watchOS keeps the HR
/// sensor on and streams samples into HealthKit; this reads them and feeds both
/// the on-watch UI (`WorkoutModel`) and the phone's live chip (`PhoneLink`).
///
/// Plain NSObject + DispatchQueue.main for the HealthKit callbacks, which arrive
/// on arbitrary queues — hopping them by hand is less error-prone than fighting
/// actor isolation in code that can't be exercised on a simulator.
final class WorkoutManager: NSObject, ObservableObject {
  static let shared = WorkoutManager()

  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var sessionStart: Date?
  /// Set before ending when the workout is being thrown away, so the session's
  /// end delegate discards the builder instead of saving an HKWorkout.
  private var pendingDiscard = false

  @Published private(set) var isRunning = false

  private var hrType: HKQuantityType? { HKObjectType.quantityType(forIdentifier: .heartRate) }
  private var energyType: HKQuantityType? {
    HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
  }
  private let bpmUnit = HKUnit.count().unitDivided(by: .minute())

  func requestAuthorization() {
    guard HKHealthStore.isHealthDataAvailable() else { return }
    var share: Set<HKSampleType> = [HKObjectType.workoutType()]
    var read: Set<HKObjectType> = []
    if let energyType {
      share.insert(energyType)
      read.insert(energyType)
    }
    if let hrType { read.insert(hrType) }
    store.requestAuthorization(toShare: share, read: read) { _, _ in }
  }

  func start() {
    let config = HKWorkoutConfiguration()
    config.activityType = .traditionalStrengthTraining
    config.locationType = .indoor
    start(with: config)
  }

  func start(with config: HKWorkoutConfiguration) {
    guard !isRunning, HKHealthStore.isHealthDataAvailable() else { return }
    do {
      let session = try HKWorkoutSession(healthStore: store, configuration: config)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
      session.delegate = self
      builder.delegate = self

      self.session = session
      self.builder = builder

      let start = Date()
      self.sessionStart = start
      session.startActivity(with: start)
      builder.beginCollection(withStart: start) { _, _ in }
      DispatchQueue.main.async {
        self.isRunning = true
        // Enter the workout UI the moment our own session starts, rather than
        // waiting for the phone to push screen:"session" — that push is racy at
        // launch and used to strand the Watch on Start while HR already streamed.
        // The phone's pushes still fill in the exercise/set detail.
        WorkoutModel.shared.screen = .session
        WorkoutModel.shared.startTicking(sessionStart: start)
      }
    } catch {
      // A session that can't start leaves isRunning false; the UI shows Start.
    }
  }

  /// Adopt an already-running session (from `recoverActiveSession`) so we hold a
  /// handle to it — wiring the same delegates/builder `start(with:)` sets up.
  private func adopt(_ session: HKWorkoutSession) {
    let builder = session.associatedWorkoutBuilder()
    builder.dataSource = HKLiveWorkoutDataSource(
      healthStore: store, workoutConfiguration: session.workoutConfiguration)
    session.delegate = self
    builder.delegate = self
    self.session = session
    self.builder = builder
    self.isRunning = true
  }

  /// Clear an orphaned session left running by a prior app process. The Watch only
  /// ever starts a session when the phone launches us into one (`start(with:)`),
  /// so a session that is already active at launch — before any phone handoff —
  /// is a leftover from a rebuild or crash that never ended. It keeps the HR
  /// sensor on and burns calories forever, and (HealthKit allows one active
  /// session at a time) blocks the next real workout from starting. Recover it and
  /// throw it away; nothing is written to Health.
  func recoverActiveSession() {
    store.recoverActiveWorkoutSession { [weak self] session, _ in
      guard let self, let session else { return }
      DispatchQueue.main.async {
        // If the phone already launched us into a fresh workout, that session is
        // legitimate — leave it alone.
        guard !self.isRunning else { return }
        self.adopt(session)
        self.discard()
      }
    }
  }

  func pause() { session?.pause() }
  func resume() { session?.resume() }

  /// End and save the session as an HKWorkout.
  func end() {
    pendingDiscard = false
    session?.end()
  }

  /// End and throw the session away — nothing is written to Health. Used when the
  /// user discards, whether they tap Discard on the Watch or on the phone.
  func discard() {
    pendingDiscard = true
    session?.end()
  }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
  func workoutSession(
    _ session: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    guard toState == .ended else { return }
    // A session that lasted under 3s is a phantom — the phone-launch handoff
    // starting then immediately dropping it. Saving it pollutes Health with a
    // 0–1s workout, so discard instead of finishing it. A user discard likewise
    // must not be written (pendingDiscard, set by `discard()`).
    let tooShort = sessionStart.map { date.timeIntervalSince($0) < 3 } ?? false
    let shouldDiscard = pendingDiscard || tooShort
    pendingDiscard = false
    builder?.endCollection(withEnd: date) { _, _ in
      if shouldDiscard {
        self.builder?.discardWorkout()
      } else {
        self.builder?.finishWorkout { _, _ in }
      }
    }
    sessionStart = nil
    DispatchQueue.main.async {
      self.isRunning = false
      WorkoutModel.shared.stopTicking()
      // Leave the workout UI when our session ends — whether ended here, from the
      // phone, or discarded as an orphan — so the Watch can't stay stuck on the
      // session screen if the phone never pushes the next state.
      WorkoutModel.shared.screen = .start
    }
  }

  func workoutSession(_ session: HKWorkoutSession, didFailWithError error: Error) {
    DispatchQueue.main.async { self.isRunning = false }
  }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    var hr: Int?
    var cal: Int?
    if let hrType, collectedTypes.contains(hrType),
      let bpm = workoutBuilder.statistics(for: hrType)?.mostRecentQuantity()?.doubleValue(for: bpmUnit)
    {
      hr = Int(bpm.rounded())
    }
    if let energyType, collectedTypes.contains(energyType),
      let kcal = workoutBuilder.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie())
    {
      cal = Int(kcal.rounded())
    }

    DispatchQueue.main.async {
      if let hr { WorkoutModel.shared.heartRate = hr }
      if let cal { WorkoutModel.shared.activeCal = cal }
      PhoneLink.shared.sendMetrics(
        hr: WorkoutModel.shared.heartRate,
        activeCal: WorkoutModel.shared.activeCal
      )
    }
  }
}
