package app.ischys.wear.session

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import androidx.wear.phone.interactions.notifications.BridgingConfig
import androidx.wear.phone.interactions.notifications.BridgingManager
import app.ischys.wear.MainActivity
import app.ischys.wear.R
import app.ischys.wear.WorkoutModel
import app.ischys.wear.link.PhoneLink
import app.ischys.wear.logic.Wire
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch

/**
 * Runs the Watch's recording session: a Health Services exercise inside a
 * foreground service. While it runs, Wear OS keeps the heart-rate sensor on
 * and this process alive with the wrist down; the readings feed the on-watch
 * screens (`WorkoutModel`) and the phone's live chip (`PhoneLink`).
 *
 * The counterpart of `WorkoutManager.swift`. One difference worth knowing:
 * Wear OS has no on-watch health store to save a workout into. Ending the
 * session sends what it measured to the phone (`sessionMetrics`), and the
 * phone is the one that writes the workout.
 */
class ExerciseService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val main = Handler(Looper.getMainLooper())
  private lateinit var client: ExerciseClient
  private var startJob: Job? = null
  private var ending = false
  private var paused = false

  // What the session measured, for the phone when it ends.
  private var hrSum = 0L
  private var hrCount = 0
  private var hrMax = 0
  private var lastHr = 0
  private var lastCal = 0

  private val callback = object : ExerciseUpdateCallback {
    override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
      main.post { onUpdate(update) }
    }

    override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
    override fun onRegistered() {}
    override fun onRegistrationFailed(throwable: Throwable) {
      Log.w(TAG, "exercise updates unavailable", throwable)
    }

    override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    client = HealthServices.getClient(this).exerciseClient
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    begin()
    // Not restarted after the process dies: a session nobody is showing is
    // cleared at the next launch instead (`recoverOrphan`).
    return START_NOT_STICKY
  }

  private fun begin() {
    if (instance != null) return
    try {
      ServiceCompat.startForeground(
        this, NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
      )
    } catch (e: Exception) {
      Log.w(TAG, "could not start the session", e)
      stopSelf()
      return
    }
    instance = this
    val start = System.currentTimeMillis()
    sessionStart = start
    setBridging(false)
    WorkoutModel.sessionStarted(start)
    startJob = scope.launch { startExercise() }
  }

  private suspend fun startExercise() {
    try {
      val capabilities = client.getCapabilitiesAsync().await()
      val type = if (ExerciseType.STRENGTH_TRAINING in capabilities.supportedExerciseTypes) {
        ExerciseType.STRENGTH_TRAINING
      } else {
        ExerciseType.WORKOUT
      }
      val supported = capabilities.getExerciseTypeCapabilities(type).supportedDataTypes
      // Each type only with its permission; asking for one that is denied
      // fails the whole exercise.
      val types = buildSet<DataType<*, *>> {
        if (granted(this@ExerciseService, heartRatePermission) && DataType.HEART_RATE_BPM in supported) {
          add(DataType.HEART_RATE_BPM)
        }
        if (granted(this@ExerciseService, Manifest.permission.ACTIVITY_RECOGNITION) &&
          DataType.CALORIES_TOTAL in supported
        ) {
          add(DataType.CALORIES_TOTAL)
        }
      }
      client.setUpdateCallback(callback)
      val config = ExerciseConfig.builder(type)
        .setDataTypes(types)
        .setIsAutoPauseAndResumeEnabled(false)
        .setIsGpsEnabled(false)
        .build()
      client.startExerciseAsync(config).await()
    } catch (e: Exception) {
      // The session goes on without sensor readings: the screens still mirror
      // the phone and the rest still buzzes.
      Log.w(TAG, "exercise did not start", e)
    }
  }

  private fun onUpdate(update: ExerciseUpdate) {
    if (instance !== this) return
    val hr = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
      .lastOrNull()?.value?.roundToInt()?.takeIf { it > 0 }
    val cal = update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.total?.roundToInt()
    if (hr != null) {
      lastHr = hr
      hrSum += hr
      hrCount += 1
      if (hr > hrMax) hrMax = hr
    }
    if (cal != null) lastCal = cal
    if (hr != null || cal != null) {
      WorkoutModel.setMetrics(hr, cal)
      PhoneLink.sendMetrics(lastHr, lastCal)
    }

    val state = update.exerciseStateInfo.state
    if (state.isPaused != paused) {
      paused = state.isPaused
      WorkoutModel.setPaused(paused)
    }
    // Ended without being asked: another app started an exercise, or a
    // permission was taken away.
    if (state.isEnded && !ending) tearDown(discard = false)
  }

  private fun togglePauseNow() {
    scope.launch {
      try {
        if (paused) client.resumeExerciseAsync().await() else client.pauseExerciseAsync().await()
      } catch (e: Exception) {
        Log.w(TAG, "pause/resume failed", e)
      }
    }
  }

  private fun endNow(discard: Boolean) {
    if (ending) return
    ending = true
    scope.launch {
      // An end that lands while the start is still in flight must wait for
      // it, or the exercise would begin after its session was torn down.
      startJob?.join()
      try {
        client.endExerciseAsync().await()
      } catch (e: Exception) {
        Log.w(TAG, "exercise did not end cleanly", e)
      }
      tearDown(discard)
    }
  }

  private fun tearDown(discard: Boolean) {
    if (instance !== this) return
    val started = sessionStart
    val ended = System.currentTimeMillis()
    instance = null
    sessionStart = null
    try {
      client.clearUpdateCallbackAsync(callback)
    } catch (_: Exception) {
    }
    // A session that lasted under 3s is a phantom — a start immediately
    // dropped — and a discard keeps nothing. Neither is reported.
    val tooShort = started == null || ended - started < MIN_SESSION_MS
    if (!discard && !tooShort && started != null) {
      val avg = if (hrCount > 0) (hrSum.toDouble() / hrCount).roundToInt() else 0
      PhoneLink.send(Wire.sessionMetrics(started, ended, avg, hrMax, lastCal))
    }
    setBridging(true)
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
    WorkoutModel.sessionEnded()
  }

  override fun onDestroy() {
    scope.cancel()
    if (instance === this) {
      instance = null
      sessionStart = null
    }
    super.onDestroy()
  }

  /**
   * Whether the phone's notifications are copied to this Watch. Off while a
   * session runs: the phone still posts its "Rest complete" alert — it is the
   * only one when no Watch is worn — and the Watch now buzzes for the same
   * moment itself, so the copy would be a second tap. Best-effort.
   */
  private fun setBridging(enabled: Boolean) {
    try {
      BridgingManager.fromContext(this).setConfig(BridgingConfig.Builder(this, enabled).build())
    } catch (e: Exception) {
      Log.w(TAG, "could not change notification bridging", e)
    }
  }

  /** The foreground notification, which is also the watch-face indicator. */
  private fun notification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_SESSION, getString(R.string.session_channel), NotificationManager.IMPORTANCE_LOW,
      ),
    )
    val open = openApp(this, startSession = false)
    val builder = NotificationCompat.Builder(this, CHANNEL_SESSION)
      .setContentTitle(getString(R.string.session_title))
      .setSmallIcon(R.drawable.ic_session)
      .setCategory(NotificationCompat.CATEGORY_WORKOUT)
      .setContentIntent(open)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
    OngoingActivity.Builder(applicationContext, NOTIFICATION_ID, builder)
      .setStaticIcon(R.drawable.ic_session)
      .setTouchIntent(open)
      .setStatus(
        Status.Builder().addPart("time", Status.StopwatchPart(SystemClock.elapsedRealtime())).build(),
      )
      .build()
      .apply(applicationContext)
    return builder.build()
  }

  companion object {
    private const val TAG = "IschysSession"
    private const val CHANNEL_SESSION = "session"
    private const val CHANNEL_START = "start"
    private const val NOTIFICATION_ID = 1
    private const val START_NOTIFICATION_ID = 2
    private const val MIN_SESSION_MS = 3_000L
    const val EXTRA_START_SESSION = "startSession"

    private var instance: ExerciseService? = null

    /** A session of this Watch's own is recording. Main thread only. */
    val running: Boolean get() = instance != null

    /** Epoch ms the running session began, or null. */
    var sessionStart: Long? = null
      private set

    val heartRatePermission: String
      get() = if (Build.VERSION.SDK_INT >= 36) {
        "android.permission.health.READ_HEART_RATE"
      } else {
        Manifest.permission.BODY_SENSORS
      }

    /** What the session can use; asked for when the app comes on screen. */
    val permissions: List<String>
      get() = buildList {
        add(heartRatePermission)
        add(Manifest.permission.ACTIVITY_RECOGNITION)
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
      }

    fun granted(context: Context, permission: String) =
      ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** A health-type foreground service may only start with one of these held. */
    private fun maySense(context: Context) =
      granted(context, heartRatePermission) ||
        granted(context, Manifest.permission.ACTIVITY_RECOGNITION)

    /**
     * Starts the session. False when it could not be started: the sensor
     * permissions are missing, or `fromPhone` and the system would not let a
     * service start from the background. The user is then asked, by a
     * notification, to open the app, which starts it.
     */
    fun start(context: Context, fromPhone: Boolean = false): Boolean {
      if (running) return true
      val started = maySense(context) && try {
        ContextCompat.startForegroundService(context, Intent(context, ExerciseService::class.java))
        true
      } catch (e: Exception) {
        Log.w(TAG, "session not started from the background", e)
        false
      }
      if (started) {
        context.getSystemService(NotificationManager::class.java).cancel(START_NOTIFICATION_ID)
      } else if (fromPhone) {
        askToOpen(context)
      }
      return started
    }

    /** The workout the phone asked us to record is over; nothing to open the app for. */
    fun dismissStartPrompt(context: Context) {
      context.getSystemService(NotificationManager::class.java).cancel(START_NOTIFICATION_ID)
    }

    /** End the session. `discard` when the workout is being thrown away. */
    fun end(discard: Boolean) {
      instance?.endNow(discard)
    }

    fun togglePause() {
      instance?.togglePauseNow()
    }

    /**
     * Clear an exercise left running by an earlier process of this app. It
     * keeps the heart-rate sensor on for a workout nothing is showing; a
     * session is only ever real while this service holds it.
     */
    fun recoverOrphan(context: Context) {
      val client = HealthServices.getClient(context).exerciseClient
      CoroutineScope(Dispatchers.Main.immediate).launch {
        try {
          val info = client.getCurrentExerciseInfoAsync().await()
          val ours = info.exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS
          // If the phone already started a fresh session, that one is real.
          if (ours && !running) {
            client.endExerciseAsync().await()
            Log.i(TAG, "ended an orphaned exercise")
          }
        } catch (e: Exception) {
          Log.w(TAG, "could not check for an orphaned exercise", e)
        }
      }
    }

    private fun openApp(context: Context, startSession: Boolean): PendingIntent =
      PendingIntent.getActivity(
        context,
        if (startSession) 1 else 0,
        Intent(context, MainActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
          .putExtra(EXTRA_START_SESSION, startSession),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    private fun askToOpen(context: Context) {
      val manager = context.getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_START, context.getString(R.string.start_channel), NotificationManager.IMPORTANCE_HIGH,
        ),
      )
      val notification = NotificationCompat.Builder(context, CHANNEL_START)
        .setContentTitle(context.getString(R.string.start_title))
        .setContentText(context.getString(R.string.start_text))
        .setSmallIcon(R.drawable.ic_session)
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .setContentIntent(openApp(context, startSession = true))
        .setAutoCancel(true)
        .build()
      try {
        manager.notify(START_NOTIFICATION_ID, notification)
      } catch (_: SecurityException) {
        // Notifications are off; the session starts when the app is opened.
      }
    }
  }
}
