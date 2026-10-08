package app.ischys.health

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.Serializable
import java.time.Duration
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.reflect.KClass
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Bridges Ischys and Health Connect: the Android side of the `Health` module,
 * answering the same calls as ios/HealthModule.swift.
 *
 * Writing: saves a finished workout as a strength-training exercise session,
 * and moves that session when the workout's date or duration is edited later
 * (`WorkoutEntries`).
 *
 * Reading: a phone has no heart-rate sensor, so heart rate and energy are
 * whatever a watch or band synced into Health Connect for the workout's
 * window, read as aggregates when it ends. Health Connect has no live feed,
 * so `onHeartRate` never fires here.
 *
 * Unlike HealthKit, Health Connect says exactly which permissions the user
 * granted, reads included (`getPermissions`).
 */
class HealthModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /**
   * The permissions last seen granted. `canWriteWorkouts` is synchronous and
   * asking Health Connect is not, so the answer is kept: refreshed at launch,
   * whenever the app returns to the foreground (the user may have been in
   * Health Connect's settings), and by every call that asks anyway.
   */
  @Volatile
  private var granted: Set<String> = emptySet()

  private lateinit var permissionsLauncher: AppContextActivityResultLauncher<PermissionsRequest, Set<String>>

  /** `HealthConnectClient.getSdkStatus`, or "none at all" below Android 8. */
  private fun status(): Int {
    // The client library itself does not run below 26 (see the manifest).
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return HealthConnectClient.SDK_UNAVAILABLE
    return try {
      HealthConnectClient.getSdkStatus(context)
    } catch (_: Exception) {
      HealthConnectClient.SDK_UNAVAILABLE
    }
  }

  private fun client(): HealthConnectClient? {
    if (status() != HealthConnectClient.SDK_AVAILABLE) return null
    return try {
      HealthConnectClient.getOrCreate(context)
    } catch (_: Exception) {
      null
    }
  }

  private fun entries(): WorkoutEntries? = client()?.let { WorkoutEntries(it, context.packageName) }

  /** The granted permissions, straight from Health Connect; null when it did not answer. */
  private suspend fun refreshGranted(): Set<String>? {
    val client = client() ?: return null
    return try {
      client.permissionController.getGrantedPermissions().also { granted = it }
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Health")
    // Declared for the shared JS surface. Health Connect has no live feed, and
    // a watch on Android reaches the app another way, so none is emitted here.
    Events("onHeartRate", "onWatchMetrics", "onWatchAction")

    RegisterActivityContracts {
      permissionsLauncher = registerForActivityResult(PermissionsContract())
    }

    OnCreate {
      appContext.backgroundCoroutineScope.launch { refreshGranted() }
    }

    OnActivityEntersForeground {
      appContext.backgroundCoroutineScope.launch { refreshGranted() }
    }

    Function("isAvailable") {
      status() == HealthConnectClient.SDK_AVAILABLE
    }

    /**
     * "available"; "needsProvider" when this phone could have Health Connect
     * but its app is missing or too old (Android 13 and earlier, where it is
     * installed from Play); "unavailable" otherwise.
     */
    Function("availability") {
      when (status()) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needsProvider"
        else -> "unavailable"
      }
    }

    /** Opens Health Connect's Play listing, to install or update it. */
    Function("openProviderListing") {
      val uri = Uri.parse("market://details?id=$PROVIDER_PACKAGE&url=healthconnect%3A%2F%2Fonboarding")
      val intent = Intent(Intent.ACTION_VIEW, uri)
        .setPackage("com.android.vending")
        .putExtra("overlay", true)
        .putExtra("callerId", context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      launch(intent)
    }

    /**
     * Shows Health Connect's permission screen for everything Ischys uses.
     * Resolves true when the user allowed at least one thing: with nothing
     * allowed there is nothing to be connected to.
     *
     * Android stops showing the screen once the user has declined it twice;
     * the request then returns at once with whatever is already granted.
     */
    AsyncFunction("requestAuthorization") Coroutine { ->
      if (client() == null) return@Coroutine false
      val answered = try {
        askForPermissions()
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        emptySet()
      }
      // Health Connect's own list is the authority; the screen's result is
      // the fallback for when it cannot be asked.
      val now = refreshGranted() ?: answered.also { granted = it }
      now.any { it in PERMISSIONS }
    }

    /**
     * What the user has allowed, one flag per thing Ischys asks for. Null when
     * Health Connect is not there or did not answer.
     */
    AsyncFunction("getPermissions") Coroutine { ->
      val now = refreshGranted() ?: return@Coroutine null
      mapOf(
        "writeWorkouts" to (WRITE_EXERCISE in now),
        "writeEnergy" to (WRITE_ENERGY in now),
        "readHeartRate" to (READ_HEART_RATE in now),
        "readEnergy" to (READ_ENERGY in now),
        "readWeight" to (READ_WEIGHT in now),
        "readBodyFat" to (READ_BODY_FAT in now)
      )
    }

    /**
     * Opens Health Connect, where Ischys is listed under App permissions. Its
     * own page there cannot be opened directly: the system keeps that intent
     * for itself. False when nothing opened.
     */
    Function("openSettings") {
      launch(
        Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }

    /**
     * Saves one strength-training session spanning [startMs, endMs], with the
     * active energy read for that window when there is any. Resolves the new
     * record's id — what lets an edit to the workout's time find it again — or
     * null when nothing was saved. Rejects when Health Connect refused the
     * write, which includes the user not having allowed it.
     */
    AsyncFunction("saveWorkout") Coroutine { startMs: Double, endMs: Double, energyKcal: Double ->
      val entries = entries() ?: return@Coroutine null
      val start = Instant.ofEpochMilli(startMs.toLong())
      val end = Instant.ofEpochMilli(endMs.toLong())
      if (!end.isAfter(start)) return@Coroutine null
      entries.save(start, end, energyKcal)
    }

    /** Whether Ischys has already put a strength session over [startMs, endMs]. */
    AsyncFunction("hasWorkout") Coroutine { startMs: Double, endMs: Double ->
      val entries = entries() ?: return@Coroutine false
      entries.find(Instant.ofEpochMilli(startMs.toLong()), Instant.ofEpochMilli(endMs.toLong())) != null
    }

    /**
     * Ischys's strength session over [startMs, endMs]: its id, start and end
     * (epoch ms), energy (kcal), the package that wrote it and `writer`, which
     * is always "phone" on Android. Null when there is none.
     */
    AsyncFunction("findWorkout") Coroutine { startMs: Double, endMs: Double ->
      val entries = entries() ?: return@Coroutine null
      entries.find(Instant.ofEpochMilli(startMs.toLong()), Instant.ofEpochMilli(endMs.toLong()))?.payload
    }

    /** Whether the user has allowed Ischys to write exercise, as last seen. */
    Function("canWriteWorkouts") {
      WRITE_EXERCISE in granted
    }

    /**
     * Moves an entry Ischys wrote to [startMs, endMs]. Resolves `{ status }`
     * with the same values as iOS; "replaced" carries the entry's `uuid`, which
     * on Android is unchanged. Never rejects.
     */
    AsyncFunction("replaceWorkout") Coroutine { uuid: String, startMs: Double, endMs: Double ->
      val entries = entries() ?: return@Coroutine mapOf("status" to "unavailable")
      val outcome = try {
        entries.replace(uuid, Instant.ofEpochMilli(startMs.toLong()), Instant.ofEpochMilli(endMs.toLong()))
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        WorkoutEntries.ReplaceOutcome.Failed
      }
      outcome.payload
    }

    /**
     * Aggregates for a finished workout: average and max heart rate (bpm) and
     * total active energy (kcal) over [startMs, endMs]. A field is null when
     * Health Connect holds nothing for it, or the user has not allowed that
     * read. Asked separately, so that one refused read does not blank both.
     */
    AsyncFunction("readWorkoutMetrics") Coroutine { startMs: Double, endMs: Double ->
      val none = mapOf<String, Any?>("avgHr" to null, "maxHr" to null, "energyKcal" to null)
      val client = client() ?: return@Coroutine none
      val start = Instant.ofEpochMilli(startMs.toLong())
      val end = Instant.ofEpochMilli(endMs.toLong())
      if (!end.isAfter(start)) return@Coroutine none
      val range = TimeRangeFilter.between(start, end)

      val heart = attempt {
        client.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MAX), range))
      }
      val energy = attempt {
        client.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), range))
      }
      mapOf(
        "avgHr" to heart?.get(HeartRateRecord.BPM_AVG)?.toInt(),
        "maxHr" to heart?.get(HeartRateRecord.BPM_MAX)?.toInt(),
        "energyKcal" to energy?.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)?.inKilocalories
      )
    }

    /**
     * The user's most recent weight, in kilograms, or null when there is none
     * or the read is not allowed.
     */
    AsyncFunction("readBodyMass") Coroutine { ->
      latest(WeightRecord::class)?.weight?.inKilograms
    }

    /**
     * Latest body-fat percentage, with the record's id and time so the caller
     * can upsert instead of appending a duplicate on every sync. Read-only.
     *
     * Body fat alone: Health Connect has no waist measurement, which HealthKit
     * does, so `waist` is never among the keys here.
     */
    AsyncFunction("readBodyMeasurements") Coroutine { ->
      val out = mutableMapOf<String, Any>()
      latest(BodyFatRecord::class)?.let {
        out["bodyFat"] = mapOf(
          // Already 0-100, the unit the measurement history keeps.
          "value" to it.percentage.value,
          "measuredAt" to it.time.toEpochMilli().toDouble(),
          "uuid" to it.metadata.id
        )
      }
      out
    }

    // Health Connect is a store that other apps sync into, not a sensor feed:
    // there is nothing to subscribe to. Present so the shared JS can call them.
    Function("startHeartRateUpdates") {}
    Function("stopHeartRateUpdates") {}

    // The watch companion's controls. On Android a watch is reached through
    // modules/wear-link and Health Connect has no part in it, so here they do
    // nothing; they exist so that shared JS falling back to this module, as it
    // does on iOS, is harmless.
    Function("startWatchWorkout") {}
    Function("stopWatchWorkout") { _: Boolean -> }
    Function("updateWatchState") { _: Map<String, Any?> -> }
    AsyncFunction("consumeWatchActions") { emptyList<Map<String, Any?>>() }
  }

  /**
   * Puts Health Connect's permission screen up and waits for the answer.
   *
   * From Android 14 health permissions are runtime permissions, and Health
   * Connect's own contract asks for them the ordinary way — which Expo's
   * activity-result registry starts but never hears back from, since the
   * answer arrives as a permission result rather than an activity result. So
   * there they go through Expo's permission service, which asks React
   * Native's activity and does deliver it. Up to Android 13 the screen is an
   * activity in the Health Connect app, and the registry is the right tool.
   */
  private suspend fun askForPermissions(): Set<String> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return permissionsLauncher.launch(PermissionsRequest(HashSet(PERMISSIONS)))
    }
    val service = appContext.permissions ?: return emptySet()
    return suspendCancellableCoroutine { continuation ->
      service.askForPermissions(
        PermissionsResponseListener { answers ->
          if (continuation.isActive) {
            continuation.resume(
              answers.filterValues { it.status == PermissionsStatus.GRANTED }.keys
            )
          }
        },
        *PERMISSIONS.toTypedArray()
      )
    }
  }

  private fun launch(intent: Intent): Boolean =
    try {
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }

  /** Null for anything that goes wrong, a refused read above all. */
  private suspend fun <T> attempt(block: suspend () -> T): T? =
    try {
      block()
    } catch (e: CancellationException) {
      throw e
    } catch (_: Exception) {
      null
    }

  /** The newest record of a type from any app, or null when none can be read. */
  private suspend fun <T : Record> latest(type: KClass<T>): T? {
    val client = client() ?: return null
    return attempt {
      client.readRecords(
        ReadRecordsRequest(
          recordType = type,
          // A day ahead, so a reading stamped by a clock running fast is not missed.
          timeRangeFilter = TimeRangeFilter.before(Instant.now().plus(Duration.ofDays(1))),
          ascendingOrder = false,
          pageSize = 1
        )
      ).records.firstOrNull()
    }
  }

  companion object {
    private const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"

    private val WRITE_EXERCISE = HealthPermission.getWritePermission(ExerciseSessionRecord::class)
    private val WRITE_ENERGY = HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class)
    private val READ_HEART_RATE = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val READ_ENERGY = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val READ_WEIGHT = HealthPermission.getReadPermission(WeightRecord::class)
    private val READ_BODY_FAT = HealthPermission.getReadPermission(BodyFatRecord::class)

    /**
     * Everything asked for, and exactly what the manifest declares. Reading
     * exercise is not among them: an app allowed to write a type may read
     * back what it wrote, and Ischys looks at no other app's sessions.
     */
    val PERMISSIONS: Set<String> = setOf(
      WRITE_EXERCISE, WRITE_ENERGY, READ_HEART_RATE, READ_ENERGY, READ_WEIGHT, READ_BODY_FAT
    )
  }
}

/** The permissions to ask for; a class of its own because Expo persists the input. */
internal data class PermissionsRequest(val permissions: HashSet<String>) : Serializable

/**
 * Health Connect's own permission contract, behind the interface Expo's
 * activity-result registry takes. Resolves the permissions now granted.
 */
internal class PermissionsContract : AppContextActivityResultContract<PermissionsRequest, Set<String>> {
  private val inner = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: PermissionsRequest): Intent =
    inner.createIntent(context, input.permissions)

  override fun parseResult(input: PermissionsRequest, resultCode: Int, intent: Intent?): Set<String> =
    inner.parseResult(resultCode, intent)
}
