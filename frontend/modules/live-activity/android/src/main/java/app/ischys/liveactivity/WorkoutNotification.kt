package app.ischys.liveactivity

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * The workout's ongoing notification: Android's counterpart to the iOS Live
 * Activity card.
 *
 * Everything it shows is kept in SharedPreferences, not in memory, because the
 * three things that redraw it — JS, a button on the notification, and the alarm
 * at the end of a rest — do not share a lifetime. A button or the alarm can
 * arrive in a process that was just started for the broadcast, with no JS and
 * no module; the stored state is all it has to draw from.
 *
 * The clocks tick on the device (a chronometer), so nothing needs to push an
 * update per second and the countdown keeps running while the app is frozen in
 * the background with the screen off.
 */
internal object WorkoutNotification {
  const val CHANNEL_ID = "workout-live"
  const val NOTIFICATION_ID = 0x15C4

  const val ACTION_SKIP_REST = "app.ischys.liveactivity.SKIP_REST"
  const val ACTION_ADJUST_REST = "app.ischys.liveactivity.ADJUST_REST"
  const val ACTION_COMPLETE_SET = "app.ischys.liveactivity.COMPLETE_SET"
  const val ACTION_REST_OVER = "app.ischys.liveactivity.REST_OVER"
  const val ACTION_DISMISSED = "app.ischys.liveactivity.DISMISSED"
  const val EXTRA_SECONDS = "seconds"
  const val EXTRA_SET_ID = "setId"

  private const val PREFS = "ischys.liveActivity"
  private const val KEY_STATE = "state"
  private const val KEY_STARTED_AT = "workoutStartedAt"
  private const val KEY_ACTIONS = "pendingActions"
  private const val KEY_THEME = "themeId"
  private const val KEY_DISMISSED = "dismissedWorkout"

  // Not in the API 36 stubs this builds against; the platform reads the extra
  // by this name.
  private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

  /**
   * How long an untouched notification may stand. A workout abandoned with the
   * app killed would otherwise count upward for days; iOS ends a Live Activity
   * on its own after a similar stretch.
   */
  private const val STALE_AFTER_MS = 12L * 60 * 60 * 1000

  /** Wakes JS when a button was tapped. Set while the Expo module is alive. */
  @Volatile
  var onAction: (() -> Unit)? = null

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun manager(context: Context) =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  // MARK: Channel and permission

  /**
   * Low importance: the notification is redrawn on every set and must never
   * buzz. The end-of-rest alert is a separate notification on its own
   * high-importance channel (`rest-timer`), and it does the buzzing.
   */
  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Workout in progress",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Your current set and rest timer while a workout is running"
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager(context).createNotificationChannel(channel)
  }

  /** Notifications are allowed for the app and this channel is not switched off. */
  fun canPost(context: Context): Boolean {
    val nm = manager(context)
    if (!nm.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ensureChannel(context)
      val channel = nm.getNotificationChannel(CHANNEL_ID)
      if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) return false
    }
    return true
  }

  fun isShowing(context: Context): Boolean =
    manager(context).activeNotifications.any { it.id == NOTIFICATION_ID }

  // MARK: Lifecycle, driven by JS

  /**
   * Returns false when nothing was shown: notifications are off, or the user
   * swiped this workout's notification away. A dismissed Live Update must not
   * be reposted, so it stays gone until the workout ends.
   */
  @Synchronized
  fun start(context: Context, workoutStartedAt: Long, state: JSONObject): Boolean {
    if (!canPost(context)) return false
    val p = prefs(context)
    if (p.getLong(KEY_DISMISSED, 0L) == workoutStartedAt) return false
    p.edit()
      .putLong(KEY_STARTED_AT, workoutStartedAt)
      .putString(KEY_STATE, state.toString())
      .remove(KEY_DISMISSED)
      .apply()
    render(context)
    return true
  }

  /** No-op without a running notification, as on iOS. */
  @Synchronized
  fun update(context: Context, state: JSONObject) {
    val p = prefs(context)
    if (!p.contains(KEY_STATE)) return
    p.edit().putString(KEY_STATE, state.toString()).apply()
    render(context)
  }

  @Synchronized
  fun end(context: Context) {
    prefs(context).edit()
      .remove(KEY_STATE)
      .remove(KEY_STARTED_AT)
      .remove(KEY_DISMISSED)
      .apply()
    cancelRestOverAlarm(context)
    manager(context).cancel(NOTIFICATION_ID)
  }

  /** The user swiped it away. Remembered per workout; see [start]. */
  @Synchronized
  fun dismissed(context: Context) {
    val p = prefs(context)
    p.edit()
      .putLong(KEY_DISMISSED, p.getLong(KEY_STARTED_AT, 0L))
      .remove(KEY_STATE)
      .apply()
    cancelRestOverAlarm(context)
  }

  @Synchronized
  fun setThemeId(context: Context, id: String) {
    prefs(context).edit().putString(KEY_THEME, id).apply()
    if (isShowing(context)) render(context)
  }

  // MARK: Buttons
  //
  // Each one redraws the notification at once and queues the action for JS,
  // which owns the workout: it does the write and then pushes the authoritative
  // state over whatever was drawn here. The same split as the iOS intents.

  @Synchronized
  fun skipRest(context: Context) {
    mutate(context) { state ->
      state.put("mode", "logging")
      state.remove("restStartedAt")
      state.remove("restEndsAt")
    }
    enqueue(context, "skipRest")
  }

  /** Never rewinds past now — a countdown that has already fired cannot un-fire. */
  @Synchronized
  fun adjustRest(context: Context, seconds: Int) {
    val now = System.currentTimeMillis()
    var applied = false
    mutate(context) { state ->
      val end = state.optDouble("restEndsAt", 0.0).toLong()
      if (state.optString("mode") != "rest" || end <= now) return@mutate
      state.put("restEndsAt", maxOf(now, end + seconds * 1000L))
      applied = true
    }
    // A tap that landed after the rest ran out adjusts nothing, so JS is not
    // told to adjust anything either.
    if (applied) enqueue(context, "adjustRest", seconds = seconds)
  }

  /**
   * Rolls the notification into rest for the set after this one, from the
   * `next` block JS supplied. Only the set on show is completed, and only once:
   * if `setId` no longer matches, JS has already moved on and the tap is stale.
   */
  @Synchronized
  fun completeSet(context: Context, setId: String) {
    var applied = false
    mutate(context) { state ->
      if (text(state, "setId") != setId) return@mutate
      applied = true

      val now = System.currentTimeMillis()
      state.put("mode", "rest")
      state.put("restStartedAt", now)
      state.put("restEndsAt", now + state.optDouble("restSeconds", 0.0).toLong() * 1000L)
      if (state.has("setsDone")) state.put("setsDone", state.optInt("setsDone") + 1)

      // No `next`: either the workout's last set, or JS has not pushed since the
      // previous completion. Rest still starts, and ✓ goes until JS refills it.
      val next = state.optJSONObject("next")
      if (next == null) {
        state.remove("setId")
        return@mutate
      }
      for (key in arrayOf("exerciseName", "subtitle", "weightLabel", "repsLabel")) {
        state.put(key, next.optString(key))
      }
      val nextSetId = text(next, "setId")
      if (nextSetId != null) state.put("setId", nextSetId) else state.remove("setId")
      state.remove("next")
    }
    if (applied) enqueue(context, "completeSet", setId = setId)
  }

  private fun mutate(context: Context, transform: (JSONObject) -> Unit) {
    val p = prefs(context)
    val state = readState(context) ?: return
    transform(state)
    p.edit().putString(KEY_STATE, state.toString()).apply()
    render(context)
  }

  /** An optional string: a key JS left undefined can arrive absent or as null. */
  private fun text(json: JSONObject, key: String): String? =
    if (json.isNull(key)) null else json.optString(key)

  private fun readState(context: Context): JSONObject? {
    val raw = prefs(context).getString(KEY_STATE, null) ?: return null
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      null
    }
  }

  // MARK: Action queue

  private fun enqueue(context: Context, action: String, setId: String? = null, seconds: Int = 0) {
    val p = prefs(context)
    val queue = readQueue(context)
    queue.put(
      JSONObject()
        .put("action", action)
        .put("seconds", seconds)
        .put("at", System.currentTimeMillis())
        .apply { if (setId != null) put("setId", setId) }
    )
    // commit, not apply: the process may have been started for this broadcast
    // alone and can be gone again before an async write lands.
    p.edit().putString(KEY_ACTIONS, queue.toString()).commit()
    onAction?.invoke()
  }

  private fun readQueue(context: Context): JSONArray {
    val raw = prefs(context).getString(KEY_ACTIONS, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  /** Returns everything queued and clears it, so an action is applied once. */
  @Synchronized
  fun drainActions(context: Context): List<Map<String, Any>> {
    val queue = readQueue(context)
    if (queue.length() == 0) return emptyList()
    prefs(context).edit().remove(KEY_ACTIONS).commit()
    return (0 until queue.length()).map { i ->
      val entry = queue.getJSONObject(i)
      buildMap {
        put("action", entry.optString("action"))
        put("seconds", entry.optInt("seconds"))
        put("at", entry.optDouble("at"))
        if (entry.has("setId")) put("setId", entry.optString("setId"))
      }
    }
  }

  // MARK: Drawing

  /**
   * Draws the notification from the stored state, or does nothing without one.
   *
   * A rest whose end has passed is drawn as logging whatever the stored mode
   * says. JS clears the rest itself, but only once it runs again — its timers
   * are paused in the background — and a countdown chronometer left alone would
   * carry on into negative time.
   */
  @Synchronized
  fun render(context: Context) {
    val state = readState(context) ?: return
    if (!canPost(context)) return

    val now = System.currentTimeMillis()
    val startedAt = prefs(context).getLong(KEY_STARTED_AT, now)
    val restEndsAt = state.optDouble("restEndsAt", 0.0).toLong()
    val resting = state.optString("mode") == "rest" && restEndsAt > now

    val exerciseName = state.optString("exerciseName")
    val subtitle = state.optString("subtitle")
    val weightLabel = state.optString("weightLabel")
    val repsLabel = state.optString("repsLabel")
    val setId = text(state, "setId")
    val accent = accentFor(prefs(context).getString(KEY_THEME, null))

    // During rest (and just after it) the subtitle already spells the set out:
    // "Next: set 2 of 4 (154 kg × 12 reps)". While logging it is only
    // "Set 2 of 4", so the numbers are appended.
    val text =
      if (subtitle.contains(weightLabel) && weightLabel.isNotEmpty()) subtitle
      else "$subtitle · $weightLabel × $repsLabel"

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID)
      else @Suppress("DEPRECATION") Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)

    builder
      .setSmallIcon(R.drawable.ischys_workout_notification)
      .setColor(accent)
      .setContentTitle(exerciseName)
      .setContentText(text)
      .setSubText(if (resting) "Rest" else "Workout")
      .setCategory(Notification.CATEGORY_WORKOUT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setLocalOnly(true)
      // The header clock: the rest counting down, otherwise the workout's
      // elapsed time counting up. Ticked by the system from `when`.
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(resting)
      .setWhen(if (resting) restEndsAt else startedAt)
      .setContentIntent(openApp(context))
      .setDeleteIntent(broadcast(context, ACTION_DISMISSED, 1))

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder.setTimeoutAfter(STALE_AFTER_MS)
    }

    if (resting) {
      builder.addAction(action("−15s", adjustIntent(context, -15, 2)))
      builder.addAction(action("+15s", adjustIntent(context, 15, 3)))
      builder.addAction(action("Skip rest", broadcast(context, ACTION_SKIP_REST, 4)))
    } else if (setId != null) {
      val intent = receiverIntent(context, ACTION_COMPLETE_SET).putExtra(EXTRA_SET_ID, setId)
      builder.addAction(action("Complete set", pending(context, intent, 5)))
    }

    if (Build.VERSION.SDK_INT >= 36) {
      // Android 16 Live Update: a status-bar chip (the Now Bar on Samsung) that
      // shows the header clock. The system decides whether to honour this; when
      // it does not, this is still an ordinary ongoing notification.
      builder.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)

      // The bar is the workout — sets done out of sets planned — not the rest:
      // it only moves when it is redrawn, and nothing redraws it mid-rest.
      val total = state.optInt("setsTotal", 0)
      if (total > 0) {
        val done = state.optInt("setsDone", 0).coerceIn(0, total)
        builder.setStyle(
          Notification.ProgressStyle()
            .setStyledByProgress(true)
            .setProgressSegments(listOf(Notification.ProgressStyle.Segment(total).setColor(accent)))
            .setProgress(done)
        )
      }
    }

    manager(context).notify(NOTIFICATION_ID, builder.build())

    if (resting) scheduleRestOverAlarm(context, restEndsAt) else cancelRestOverAlarm(context)
  }

  private fun action(title: String, intent: PendingIntent): Notification.Action =
    Notification.Action.Builder(null, title, intent).build()

  // MARK: Intents

  private fun receiverIntent(context: Context, action: String) =
    Intent(context, WorkoutNotificationReceiver::class.java).setAction(action)

  private fun pending(context: Context, intent: Intent, requestCode: Int): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun broadcast(context: Context, action: String, requestCode: Int) =
    pending(context, receiverIntent(context, action), requestCode)

  private fun adjustIntent(context: Context, seconds: Int, requestCode: Int) =
    pending(
      context,
      receiverIntent(context, ACTION_ADJUST_REST).putExtra(EXTRA_SECONDS, seconds),
      requestCode
    )

  /** Tapping the body brings the app forward, wherever the user left it. */
  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // MARK: End-of-rest redraw

  /**
   * Redraws the notification into logging when the rest runs out. Not a wakeup
   * alarm: with the screen off nobody is looking, and it fires the moment the
   * device next wakes, before the notification can be seen.
   */
  private fun scheduleRestOverAlarm(context: Context, at: Long) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val intent = broadcast(context, ACTION_REST_OVER, 6)
    try {
      val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
      if (exact) alarms.setExact(AlarmManager.RTC, at, intent) else alarms.set(AlarmManager.RTC, at, intent)
    } catch (_: SecurityException) {
      // Exact-alarm access was withdrawn between the check and the call.
      alarms.set(AlarmManager.RTC, at, intent)
    }
  }

  private fun cancelRestOverAlarm(context: Context) {
    val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarms.cancel(broadcast(context, ACTION_REST_OVER, 6))
  }

  /**
   * Accent palettes, duplicated from `src/theme/palettes.ts` as the iOS widget
   * does: a broadcast can redraw this with no JS running. The ids are the
   * contract, and an unknown one falls back to Ember.
   */
  private fun accentFor(themeId: String?): Int = when (themeId) {
    "volt" -> 0xFFC6F135.toInt()
    "ion" -> 0xFFC58BFF.toInt()
    "chalk" -> 0xFFF4F4F5.toInt()
    else -> 0xFFFF4A1C.toInt()
  }
}
