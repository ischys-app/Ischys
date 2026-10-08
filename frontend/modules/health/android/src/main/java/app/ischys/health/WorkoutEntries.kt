package app.ischys.health

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CancellationException

/**
 * Ischys's own strength workouts in Health Connect: writing one, finding the
 * one over a window, and moving one when its time is edited.
 *
 * The Android counterpart of ios/WorkoutEntries.swift, kept free of Expo for
 * the same reason. Two things are simpler here than in HealthKit. A record can
 * be updated in place by the app that wrote it, so an edit keeps the entry's
 * id instead of deleting and saving again. And nothing but the phone app
 * writes for Ischys — a watch has no Health Connect of its own — so every
 * entry found is the phone's.
 */
internal class WorkoutEntries(
  private val client: HealthConnectClient,
  private val packageName: String
) {
  class Entry(val session: ExerciseSessionRecord, val energyKcal: Double) {
    /** The shape JS reads (epoch milliseconds, as everywhere in the module). */
    val payload: Map<String, Any>
      get() = mapOf(
        "uuid" to session.metadata.id,
        "startedAt" to session.startTime.toEpochMilli().toDouble(),
        "endedAt" to session.endTime.toEpochMilli().toDouble(),
        "energyKcal" to energyKcal,
        "writer" to "phone",
        "bundleId" to session.metadata.dataOrigin.packageName
      )
  }

  sealed class ReplaceOutcome(val payload: Map<String, Any>) {
    class Replaced(id: String) : ReplaceOutcome(mapOf("status" to "replaced", "uuid" to id))

    /**
     * No entry with that id any more: it was deleted in Health Connect. Only
     * ever the answer of a read that ran and found nothing.
     */
    object Missing : ReplaceOutcome(mapOf("status" to "missing"))

    /** The entry is another app's. Nothing was done to it. */
    object NotOurs : ReplaceOutcome(mapOf("status" to "notOurs"))

    /** The user has not allowed Ischys to write exercise. */
    object Denied : ReplaceOutcome(mapOf("status" to "denied"))

    /** Nothing changed, and nothing was learned either. */
    object Failed : ReplaceOutcome(mapOf("status" to "failed"))
  }

  private val ours = setOf(DataOrigin(packageName))

  // MARK: Writing

  /**
   * Saves one strength-training session spanning [start, end], with the active
   * energy for that window when there is any. Returns the new record's id.
   */
  suspend fun save(start: Instant, end: Instant, energyKcal: Double): String {
    val session = session(start, end, Metadata.activelyRecorded(Device(type = Device.TYPE_PHONE)))
    val id = client.insertRecords(listOf(session)).recordIdsList.first()
    // Energy another device measured, so the session shows calories rather
    // than a blank. Nothing is fabricated: a zero simply adds no record. One
    // that cannot be added (the user allowed exercise but not calories) is not
    // a reason to lose the workout.
    if (energyKcal > 0) {
      quietly { writeEnergy(id, start, end, energyKcal) }
    }
    return id
  }

  // MARK: Finding

  /**
   * The strength session Ischys has put over [start, end], if there is one.
   *
   * Only Ischys's own: another app's session overlapping the window must not
   * be mistaken for the user's workout. Overlap rather than an exact match,
   * and most of both intervals, for the reasons given in the Swift original.
   *
   * A read error finds nothing, and deliberately: the finish path asks this
   * before writing, and must write rather than lose a workout. That includes
   * the user not allowing Ischys to write exercise, which is also what lets it
   * read its own sessions back; nothing can be written then either.
   */
  suspend fun find(start: Instant, end: Instant): Entry? {
    if (!end.isAfter(start)) return null
    val length = Duration.between(start, end)
    // Health Connect matches a session by where it starts. One that covers
    // half of this window and is itself half covered by it cannot start
    // earlier than two window-lengths before `start`.
    val range = TimeRangeFilter.between(start.minus(length.multipliedBy(2)), end)
    val sessions = try {
      sessions(range)
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      return null
    }

    var best: ExerciseSessionRecord? = null
    var bestOverlap = 0L
    for (session in sessions) {
      if (session.exerciseType != ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING) continue
      val overlap = overlapMillis(
        start.toEpochMilli(), end.toEpochMilli(),
        session.startTime.toEpochMilli(), session.endTime.toEpochMilli()
      )
      if (!coversMostOfBoth(overlap, length.toMillis(), sessionMillis(session))) continue
      if (best == null || overlap > bestOverlap) {
        best = session
        bestOverlap = overlap
      }
    }
    return best?.let { Entry(it, energyKcal(of = it)) }
  }

  // MARK: Replacing

  /**
   * Gives an entry Ischys wrote a new start and end, in place: the record
   * keeps its id, and the energy saved with it moves to the new window.
   *
   * `Missing` is only ever a read that ran and found nothing. One that could
   * not run is `Failed`, which keeps the entry on record for the next edit.
   */
  suspend fun replace(id: String, start: Instant, end: Instant): ReplaceOutcome {
    if (!end.isAfter(start)) return ReplaceOutcome.Failed
    val granted = try {
      client.permissionController.getGrantedPermissions()
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      return ReplaceOutcome.Failed
    }
    if (HealthPermission.getWritePermission(ExerciseSessionRecord::class) !in granted) {
      return ReplaceOutcome.Denied
    }

    val old = when (val found = lookup(id)) {
      is Lookup.Found -> found.session
      Lookup.Missing -> return ReplaceOutcome.Missing
      Lookup.Failed -> return ReplaceOutcome.Failed
    }
    if (old.metadata.dataOrigin.packageName != packageName) return ReplaceOutcome.NotOurs

    // Read before the session moves: afterwards the old window is not known.
    val energy = energyKcal(of = old)
    try {
      // The times are now the user's word rather than the phone's clock.
      client.updateRecords(listOf(session(start, end, Metadata.manualEntryWithId(id))))
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      return ReplaceOutcome.Failed
    }
    // The session is what the edit is about. Energy left on the old window is
    // a smaller wrong than reporting a move that did happen as failed.
    if (energy > 0) {
      quietly { writeEnergy(id, start, end, energy) }
    }
    return ReplaceOutcome.Replaced(id)
  }

  // MARK: Helpers

  private sealed class Lookup {
    class Found(val session: ExerciseSessionRecord) : Lookup()
    object Missing : Lookup()
    object Failed : Lookup()
  }

  /**
   * The session with this id. Reading one that is gone throws, and so does
   * Health Connect not answering; the two must not be confused, so a failed
   * read is settled by listing Ischys's sessions and looking for the id.
   */
  private suspend fun lookup(id: String): Lookup {
    try {
      return Lookup.Found(client.readRecord(ExerciseSessionRecord::class, id).record)
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      // Decided below.
    }
    return try {
      val all = sessions(TimeRangeFilter.before(Instant.now().plus(Duration.ofDays(1))))
      all.firstOrNull { it.metadata.id == id }?.let { Lookup.Found(it) } ?: Lookup.Missing
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      Lookup.Failed
    }
  }

  private fun session(start: Instant, end: Instant, metadata: Metadata): ExerciseSessionRecord {
    val zone = ZoneId.systemDefault().rules
    return ExerciseSessionRecord(
      startTime = start,
      startZoneOffset = zone.getOffset(start),
      endTime = end,
      endZoneOffset = zone.getOffset(end),
      metadata = metadata,
      // Weights and machines, which is what Ischys logs.
      exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
    )
  }

  private fun sessionMillis(session: ExerciseSessionRecord): Long =
    Duration.between(session.startTime, session.endTime).toMillis()

  /** Every session Ischys wrote that starts in `range`. Throws when the read fails. */
  private suspend fun sessions(range: TimeRangeFilter): List<ExerciseSessionRecord> {
    val out = mutableListOf<ExerciseSessionRecord>()
    var page: String? = null
    do {
      val response = client.readRecords(
        ReadRecordsRequest(
          recordType = ExerciseSessionRecord::class,
          timeRangeFilter = range,
          dataOriginFilter = ours,
          pageToken = page
        )
      )
      out += response.records
      page = response.pageToken
    } while (page != null)
    return out
  }

  /**
   * Health Connect has no link from a session to the energy saved with it, so
   * the energy record is named after the session. Writing under the same name
   * with a later version replaces it, which is how it follows an edit.
   */
  private fun energyKey(sessionId: String) = "energy:$sessionId"

  private suspend fun writeEnergy(sessionId: String, start: Instant, end: Instant, kcal: Double) {
    val zone = ZoneId.systemDefault().rules
    client.insertRecords(
      listOf(
        ActiveCaloriesBurnedRecord(
          startTime = start,
          startZoneOffset = zone.getOffset(start),
          endTime = end,
          endZoneOffset = zone.getOffset(end),
          energy = Energy.kilocalories(kcal),
          metadata = Metadata.manualEntry(
            clientRecordId = energyKey(sessionId),
            clientRecordVersion = System.currentTimeMillis()
          )
        )
      )
    )
  }

  /** The energy Ischys saved with a session, or 0 when it saved none. */
  private suspend fun energyKcal(of: ExerciseSessionRecord): Double {
    val key = energyKey(of.metadata.id)
    return try {
      client.readRecords(
        ReadRecordsRequest(
          recordType = ActiveCaloriesBurnedRecord::class,
          timeRangeFilter = TimeRangeFilter.between(of.startTime, of.endTime.plusMillis(1)),
          dataOriginFilter = ours
        )
      ).records
        .filter { it.metadata.clientRecordId == key }
        .sumOf { it.energy.inKilocalories }
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      0.0
    }
  }

  private suspend fun quietly(block: suspend () -> Unit) {
    try {
      block()
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      // Best-effort by design; see the call sites.
    }
  }
}

/** How long two [start, end) intervals share, in milliseconds; never negative. */
internal fun overlapMillis(aStart: Long, aEnd: Long, bStart: Long, bEnd: Long): Long =
  maxOf(0L, minOf(aEnd, bEnd) - maxOf(aStart, bStart))

/**
 * Back-to-back sessions touch at an endpoint and would match on overlap alone.
 * A real match covers at least half of both intervals.
 */
internal fun coversMostOfBoth(overlap: Long, windowLength: Long, sessionLength: Long): Boolean =
  overlap > 0 && overlap * 2 >= windowLength && overlap * 2 >= sessionLength
