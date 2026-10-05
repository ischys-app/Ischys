import Foundation
import HealthKit

/// Ischys's own strength workouts in Apple Health: writing one, finding the one
/// over a window, and replacing one the phone wrote when its time is edited.
///
/// Kept apart from `HealthModule` and free of ExpoModulesCore, so it depends on
/// HealthKit alone and can be type-checked against the iOS SDK by itself.
final class WorkoutEntries {
  /// Who put an entry in Health. The Watch companion's bundle id is the phone
  /// app's plus a suffix, which is how the two are told apart.
  enum Writer: String {
    case phone
    case watch
  }

  struct Entry {
    let workout: HKWorkout
    let writer: Writer
    let energyKcal: Double

    /// The shape JS reads (epoch milliseconds, as everywhere in the module).
    var payload: [String: Any] {
      [
        "uuid": workout.uuid.uuidString,
        "startedAt": workout.startDate.timeIntervalSince1970 * 1000,
        "endedAt": workout.endDate.timeIntervalSince1970 * 1000,
        "energyKcal": energyKcal,
        "writer": writer.rawValue,
        "bundleId": workout.sourceRevision.source.bundleIdentifier,
      ]
    }
  }

  enum ReplaceOutcome {
    case replaced(UUID)
    /// No entry with that UUID any more: it was deleted in Health.
    case missing
    /// The entry is not one the phone wrote. Nothing was done to it.
    case notOurs
    /// iOS does not let Ischys write workouts.
    case denied
    case failed

    var payload: [String: Any] {
      switch self {
      case .replaced(let uuid): return ["status": "replaced", "uuid": uuid.uuidString]
      case .missing: return ["status": "missing"]
      case .notOurs: return ["status": "notOurs"]
      case .denied: return ["status": "denied"]
      case .failed: return ["status": "failed"]
      }
    }
  }

  private let store: HKHealthStore

  init(store: HKHealthStore) {
    self.store = store
  }

  private var energyType: HKQuantityType? {
    HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
  }

  /// Write access to workouts. Unlike read access, HealthKit reports this one
  /// honestly, so "denied" here really is denied.
  var canWriteWorkouts: Bool {
    store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
  }

  /// Which half of Ischys wrote a sample, or nil when it was another app.
  ///
  /// Only workouts written by Ischys ever count. Another app's strength session
  /// overlapping a window must not be mistaken for the user's workout, so the
  /// source is matched against our own bundle id — exactly for the phone, and
  /// as a prefix for the Watch companion.
  func writer(of sample: HKSample) -> Writer? {
    let ours = Bundle.main.bundleIdentifier ?? ""
    guard !ours.isEmpty else { return nil }
    let id = sample.sourceRevision.source.bundleIdentifier
    if id == ours { return .phone }
    if id.hasPrefix(ours + ".") { return .watch }
    return nil
  }

  // MARK: Writing

  /// Saves one strength-training workout spanning [start, end], with the active
  /// energy for that window when there is any. Returns nil when HealthKit
  /// finished without producing a workout.
  func save(start: Date, end: Date, energyKcal: Double) async throws -> HKWorkout? {
    let config = HKWorkoutConfiguration()
    // Traditional = weights/machines (what Ischys logs). Functional would be
    // kettlebell/bodyweight movement work; wrong for a barbell app.
    config.activityType = .traditionalStrengthTraining

    let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
    try await builder.beginCollection(at: start)

    // Attach energy the Watch measured, so Fitness shows calories rather than a
    // blank. Nothing is fabricated — energyKcal is a HealthKit sum, and a zero
    // (no Watch) simply adds no sample. A sample that cannot be added is not a
    // reason to lose the workout.
    if energyKcal > 0, let energyType {
      let quantity = HKQuantity(unit: .kilocalorie(), doubleValue: energyKcal)
      let sample = HKCumulativeQuantitySample(
        type: energyType, quantity: quantity, start: start, end: end
      )
      try? await builder.addSamples([sample])
    }

    try await builder.endCollection(at: end)
    return try await builder.finishWorkout()
  }

  // MARK: Finding

  /// The strength HKWorkout Ischys has put over [start, end], if there is one.
  ///
  /// Overlap, not containment: the Watch's session begins a moment after the
  /// workout does and its HKWorkout is stamped from the session, so a strict
  /// match would miss exactly the entry being looked for.
  ///
  /// A query error (including workout-read access being denied, which HealthKit
  /// reports as no data rather than an error) finds nothing.
  ///
  /// When both halves wrote one — the rare duplicate — the Watch's is the one
  /// returned: it is the recording, and the one that must never be altered.
  func find(start: Date, end: Date) async -> Entry? {
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
      HKQuery.predicateForSamples(withStart: start, end: end, options: []),
      HKQuery.predicateForWorkouts(with: .traditionalStrengthTraining),
    ])
    let sessionLength = end.timeIntervalSince(start)

    var best: (workout: HKWorkout, writer: Writer, overlap: TimeInterval)?
    for workout in await workouts(matching: predicate) {
      guard let writer = writer(of: workout) else { continue }

      // Back-to-back sessions touch at an endpoint and would otherwise match on
      // overlap alone. A real match covers most of both intervals, so require
      // that of it.
      let overlap = min(end, workout.endDate).timeIntervalSince(max(start, workout.startDate))
      guard overlap > 0 else { continue }
      let length = workout.endDate.timeIntervalSince(workout.startDate)
      guard overlap >= length / 2, overlap >= sessionLength / 2 else { continue }

      if let current = best {
        let better =
          current.writer == writer ? overlap > current.overlap : writer == .watch
        if !better { continue }
      }
      best = (workout, writer, overlap)
    }

    guard let best else { return nil }
    return Entry(workout: best.workout, writer: best.writer, energyKcal: energyKcal(of: best.workout))
  }

  // MARK: Replacing

  /// Gives an entry the PHONE wrote a new start and end: HealthKit samples
  /// cannot be edited, so a new workout is saved over the new window, carrying
  /// the old one's energy, and the old one is deleted.
  ///
  /// An entry from any other source — the Watch app's recording above all — is
  /// left exactly as it is and reported as `.notOurs`.
  ///
  /// The new entry is saved before the old one is deleted, so a failure part way
  /// leaves Health with the entry it had rather than with none.
  func replace(uuid: UUID, start: Date, end: Date) async -> ReplaceOutcome {
    guard end > start else { return .failed }
    guard canWriteWorkouts else { return .denied }
    guard let old = await workouts(matching: HKQuery.predicateForObject(with: uuid)).first else {
      return .missing
    }
    guard writer(of: old) == .phone else { return .notOurs }

    // Read while the old workout still exists: once it is deleted, nothing
    // says which energy sample was its.
    let oldEnergy = await ownEnergySamples(of: old)

    guard
      let new = try? await save(start: start, end: end, energyKcal: energyKcal(of: old))
    else { return .failed }

    do {
      try await store.delete(old)
    } catch {
      // Two entries for one workout would be worse than the old times: take
      // the new one back and leave Health as it was.
      await discard(new)
      return .failed
    }
    // The old energy sample would otherwise be counted alongside the new one.
    if !oldEnergy.isEmpty {
      try? await store.delete(oldEnergy)
    }
    return .replaced(new.uuid)
  }

  // MARK: Helpers

  private func energyKcal(of workout: HKWorkout) -> Double {
    guard let energyType else { return 0 }
    return workout.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? 0
  }

  private func workouts(matching predicate: NSPredicate) async -> [HKWorkout] {
    await samples(of: HKObjectType.workoutType(), matching: predicate).compactMap { $0 as? HKWorkout }
  }

  /// The energy samples this app saved with a workout it built. Never another
  /// source's: those are not ours to delete, and HealthKit would refuse anyway.
  private func ownEnergySamples(of workout: HKWorkout) async -> [HKSample] {
    guard let energyType else { return [] }
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
      HKQuery.predicateForObjects(from: workout),
      HKQuery.predicateForObjects(from: HKSource.default()),
    ])
    return await samples(of: energyType, matching: predicate)
  }

  private func samples(of type: HKSampleType, matching predicate: NSPredicate) async -> [HKSample] {
    await withCheckedContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: type,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: nil
      ) { _, samples, _ in
        continuation.resume(returning: samples ?? [])
      }
      store.execute(query)
    }
  }

  private func discard(_ workout: HKWorkout) async {
    let energy = await ownEnergySamples(of: workout)
    try? await store.delete(workout)
    if !energy.isEmpty {
      try? await store.delete(energy)
    }
  }
}
