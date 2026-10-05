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
    /// No entry with that UUID any more: it was deleted in Health. Only ever
    /// the answer of a query that ran and found nothing; a query that could not
    /// run is `.failed`.
    case missing
    /// The entry is not one the phone wrote. Nothing was done to it.
    case notOurs
    /// iOS does not let Ischys write workouts.
    case denied
    /// Nothing changed, and nothing was learned either: a query or a write did
    /// not go through (a locked phone refuses both). The entry is still the
    /// workout's, and the next edit to its time tries again.
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

  /// On every entry `replace` saves: the UUID of the entry it stands in for.
  /// What lets a replace that was cut short be recognised and finished later.
  static let replacesKey = "IschysReplacesWorkoutUUID"

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
  ///
  /// `replacing` is set only by `replace`: the entry this one stands in for,
  /// recorded in its metadata. A finished workout's entry carries none.
  func save(
    start: Date, end: Date, energyKcal: Double, replacing: UUID? = nil
  ) async throws -> HKWorkout? {
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

    // Only bookkeeping for a later replace, so, like the energy, failing to
    // attach it is not a reason to lose the entry.
    if let replacing {
      try? await builder.addMetadata([Self.replacesKey: replacing.uuidString])
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
    // An error is "nothing found" here, and deliberately: the finish path asks
    // this before writing, and must write rather than lose a workout.
    for workout in await workouts(matching: predicate) ?? [] {
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
  ///
  /// `.missing` is only ever a query that ran and found nothing. One that could
  /// not run — HealthKit refuses every query while the phone is locked, and
  /// this runs just after Save — is `.failed`, which keeps the entry on record.
  ///
  /// If the app is killed between "save new" and "delete old", Health holds
  /// both and the workout still points at the old one; killed just after the
  /// delete, it points at an entry that is gone. Every entry saved here names
  /// the one it replaces (`replacesKey`), so the next replace sees either case
  /// and finishes the job first: with the old entry still there, the leftover
  /// new one is taken back; with the old one gone, the leftover is the entry.
  /// Until that next replace the first case shows the workout twice in Health.
  func replace(uuid: UUID, start: Date, end: Date) async -> ReplaceOutcome {
    guard end > start else { return .failed }
    guard canWriteWorkouts else { return .denied }
    guard let stored = await workouts(matching: HKQuery.predicateForObject(with: uuid)) else {
      return .failed
    }
    if let found = stored.first, writer(of: found) != .phone { return .notOurs }
    guard let leftovers = await replacements(of: uuid) else { return .failed }

    // The entry to replace: the stored one, or, when a cut-short replace
    // already deleted it, the one that replace saved in its place.
    guard let old = stored.first ?? leftovers.first else { return .missing }
    for extra in leftovers where extra.uuid != old.uuid {
      guard await discard(extra) else { return .failed }
    }

    // Read while the old workout still exists: once it is deleted, nothing
    // says which energy sample was its.
    guard let oldEnergy = await ownEnergySamples(of: old) else { return .failed }
    // The workout's own total, or, when HealthKit has none to give, the sum of
    // the samples about to be deleted, so the energy is never dropped with them.
    let energy = statisticsEnergy(of: old) ?? Self.totalKcal(of: oldEnergy)

    guard
      let new = try? await save(start: start, end: end, energyKcal: energy, replacing: old.uuid)
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
    statisticsEnergy(of: workout) ?? 0
  }

  /// The workout's active-energy total as HealthKit reports it, or nil when it
  /// reports none.
  private func statisticsEnergy(of workout: HKWorkout) -> Double? {
    guard let energyType else { return nil }
    return workout.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie())
  }

  private static func totalKcal(of samples: [HKSample]) -> Double {
    samples
      .compactMap { ($0 as? HKQuantitySample)?.quantity.doubleValue(for: .kilocalorie()) }
      .reduce(0, +)
  }

  /// Nil when the query failed, which is not the same as finding none.
  private func workouts(matching predicate: NSPredicate) async -> [HKWorkout]? {
    await samples(of: HKObjectType.workoutType(), matching: predicate)?
      .compactMap { $0 as? HKWorkout }
  }

  /// The phone-written entries `replace` saved in place of `uuid`: at most one,
  /// and only when a replace was cut short. Nil when the query failed.
  private func replacements(of uuid: UUID) async -> [HKWorkout]? {
    let predicate = HKQuery.predicateForObjects(
      withMetadataKey: Self.replacesKey, allowedValues: [uuid.uuidString]
    )
    return await workouts(matching: predicate)?.filter { writer(of: $0) == .phone }
  }

  /// The energy samples this app saved with a workout it built. Never another
  /// source's: those are not ours to delete, and HealthKit would refuse anyway.
  /// Nil when the query failed.
  private func ownEnergySamples(of workout: HKWorkout) async -> [HKSample]? {
    guard let energyType else { return [] }
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
      HKQuery.predicateForObjects(from: workout),
      HKQuery.predicateForObjects(from: HKSource.default()),
    ])
    return await samples(of: energyType, matching: predicate)
  }

  /// The samples matching a predicate, or nil when HealthKit could not answer
  /// (protected data while the phone is locked, above all). An empty array is
  /// a real "there are none"; callers must not read nil as that.
  private func samples(of type: HKSampleType, matching predicate: NSPredicate) async -> [HKSample]? {
    await withCheckedContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: type,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: nil
      ) { _, samples, error in
        continuation.resume(returning: error == nil ? samples : nil)
      }
      store.execute(query)
    }
  }

  /// Deletes a workout this app saved, and its energy. False when the workout
  /// is still there.
  @discardableResult
  private func discard(_ workout: HKWorkout) async -> Bool {
    // Not knowing the energy samples is no reason to keep the workout.
    let energy = await ownEnergySamples(of: workout) ?? []
    do {
      try await store.delete(workout)
    } catch {
      return false
    }
    if !energy.isEmpty {
      try? await store.delete(energy)
    }
    return true
  }
}
