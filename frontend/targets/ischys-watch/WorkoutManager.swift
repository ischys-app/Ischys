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
  /// The current session's ending: asked for once, discarded or saved, and
  /// cleaned up here if HealthKit never confirms it (see `SessionEnd`).
  private var ending = SessionEnd()
  /// A workout the phone launched us into while the previous session was still
  /// ending. Started as soon as that one is closed.
  private var startWhenClosed: HKWorkoutConfiguration?
  private var pause = SessionPause()

  @Published private(set) var isRunning = false
  /// The session is paused from Controls (see `SessionPause`).
  @Published private(set) var isPaused = false

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
    guard HKHealthStore.isHealthDataAvailable() else { return }
    if isRunning {
      // The last session is on its way out and this is the next workout: it
      // gets a session of its own the moment that one is closed. A session
      // simply running is the one this request is for already.
      if ending.isEnding { startWhenClosed = config }
      return
    }
    do {
      let session = try HKWorkoutSession(healthStore: store, configuration: config)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
      session.delegate = self
      builder.delegate = self

      self.session = session
      self.builder = builder
      self.ending = SessionEnd()
      self.pause.reset()

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
        // Pull the phone's current workout state so the session screen isn't left
        // showing empty defaults if the phone's first push was missed.
        PhoneLink.shared.requestState()
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
    self.ending = SessionEnd()
    self.pause.reset()
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

  /// Pause, or Resume: whichever the session is not doing (`SessionPause`).
  /// `isPaused` changes when HealthKit reports the new state, not here.
  func togglePause() {
    switch pause.toggle {
    case .pause: session?.pause()
    case .resume: session?.resume()
    }
  }

  /// The number of sets logged changed, on the wrist or on the phone. Logging
  /// a set while paused resumes the session.
  func setsChanged(from before: Int, to after: Int) {
    if pause.resumesOnSets(from: before, to: after) { session?.resume() }
  }

  /// End and save the session as an HKWorkout.
  ///
  /// Not what the Finish button calls: that asks the phone first and ends only
  /// once the workout is stored there (`WorkoutModel.requestFinish`). This runs
  /// on the phone's word, or when the phone could not be asked or did not answer.
  func end() { requestEnd(discard: false) }

  /// End and throw the session away — nothing is written to Health. Used when the
  /// user discards, whether they tap Discard on the Watch or on the phone.
  func discard() { requestEnd(discard: true) }

  /// Tells the session to end, once. A repeat — the phone echoing a discard
  /// that began on the wrist — only records that the recording is discarded.
  private func requestEnd(discard: Bool) {
    guard let session, ending.request(discard: discard, now: Date()) else { return }
    session.end()
    // HealthKit confirms through the delegate, normally within a couple of
    // seconds. If it never does, close the session here instead.
    DispatchQueue.main.asyncAfter(deadline: .now() + SessionEnd.timeout) { [weak self] in
      DispatchQueue.main.async { self?.closeIfUnconfirmed(session) }
    }
  }

  @MainActor private func closeIfUnconfirmed(_ asked: HKWorkoutSession) {
    guard asked === session, ending.timedOut(now: Date()), let outcome = ending.settle() else {
      return
    }
    close(outcome, endedAt: Date(), confirmed: false)
  }

  /// The session is over: save or discard its recording, forget it, and leave
  /// the workout's pages. Runs once per session, on the main queue.
  ///
  /// `confirmed` is false when HealthKit never reported the end. The recording
  /// is then discarded outright, whatever was asked for, and without first
  /// closing its collection:
  ///
  /// - Closing and saving both answer through callbacks of their own, and with
  ///   the session stuck they do not arrive either. A recording left open like
  ///   that is one HealthKit saves by itself when the app is next closed —
  ///   which is how a discarded workout reached Health.
  /// - Nothing is lost by it. The phone waits for our "saved" and, hearing
  ///   nothing, writes the workout to Health itself, with the times it has and
  ///   the heart rate and energy already in Health (`syncFinishedWorkout`). A
  ///   save of ours that came through late would make that entry a second one.
  @MainActor
  private func close(_ outcome: SessionEnd.Outcome, endedAt date: Date, confirmed: Bool) {
    let builder = self.builder
    if !confirmed {
      builder?.discardWorkout()
    } else {
      builder?.endCollection(withEnd: date) { _, _ in
        switch outcome {
        case .discard:
          builder?.discardWorkout()
        case .save:
          builder?.finishWorkout { workout, _ in
            // Confirm the save to the phone so it doesn't write a duplicate. If
            // this never arrives — the save failed, auth was missing, we crashed —
            // the phone times out waiting and writes the workout itself, so a
            // finished workout is never silently lost.
            //
            // The phone is usually already waiting when this is sent: it stored
            // the finish first and then told us to end (#95). How long it waits
            // is tied to `FinishHandshake.verdictTimeout`.
            //
            // The UUID goes with it: the phone records which Health entry is this
            // workout's and that the Watch wrote it, so a later edit to the
            // workout's time leaves this recording alone. HealthKit keeps the
            // UUID when the workout syncs to the phone.
            if let workout { PhoneLink.shared.workoutSaved(uuid: workout.uuid.uuidString) }
          }
        }
      }
    }
    session = nil
    self.builder = nil
    sessionStart = nil
    pause.reset()
    isPaused = false
    isRunning = false
    WorkoutModel.shared.stopTicking()
    // Nothing is waiting on a finish, or reporting a failed one, once the
    // session it was about has ended.
    WorkoutModel.shared.finishSettled()
    // Leave the workout UI when our session ends — whether ended here, from the
    // phone, or discarded as an orphan — so the Watch can't stay stuck on the
    // session screen if the phone never pushes the next state.
    WorkoutModel.shared.screen = .start

    // The next workout was asked for while this one was still ending.
    if let next = startWhenClosed {
      startWhenClosed = nil
      start(with: next)
    }
  }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
  func workoutSession(
    _ session: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    // HealthKit calls back off the main queue; everything below is main-only.
    DispatchQueue.main.async {
      // A session already closed here (its end went unconfirmed and timed out)
      // or replaced: whatever it reports now is about nothing we still hold.
      guard session === self.session else { return }
      guard toState == .ended else {
        if toState == .paused || toState == .running {
          self.pause.sessionChanged(paused: toState == .paused)
          self.isPaused = self.pause.paused
        }
        return
      }
      // A session that lasted under 3s is a phantom — the phone-launch handoff
      // starting then immediately dropping it. Saving it pollutes Health with a
      // 0–1s workout, so discard instead of finishing it. A user discard likewise
      // must not be written (`SessionEnd`).
      let tooShort = self.sessionStart.map { date.timeIntervalSince($0) < 3 } ?? false
      guard let outcome = self.ending.settle(tooShort: tooShort) else { return }
      self.close(outcome, endedAt: date, confirmed: true)
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
