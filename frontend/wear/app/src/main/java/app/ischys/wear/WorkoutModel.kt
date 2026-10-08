package app.ischys.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import app.ischys.wear.link.PhoneLink
import app.ischys.wear.logic.PhoneState
import app.ischys.wear.logic.UiState
import app.ischys.wear.logic.Wire
import app.ischys.wear.logic.WorkoutCore
import app.ischys.wear.session.ExerciseService
import java.util.UUID
import org.json.JSONObject

/**
 * The single source of UI state for the Watch app, and the only thing the
 * screens call. The rules are in `WorkoutCore` (pure, unit-tested); this gives
 * them a clock, a vibrator, the phone link and the exercise session.
 *
 * Main thread only.
 */
object WorkoutModel : WorkoutCore.Host {
  private const val TAG = "IschysWear"
  private const val PREFS = "ischys"
  private const val KEY_THEME = "themeId"

  private lateinit var app: Context
  private lateinit var core: WorkoutCore
  private val handler = Handler(Looper.getMainLooper())
  private val state = mutableStateOf(UiState())
  private var wakeLock: PowerManager.WakeLock? = null

  /** What the screens observe. */
  val ui: State<UiState> get() = state

  /**
   * The phone asked for a session and it could not be started from the
   * background, or without the sensor permissions. Started the next time the
   * app is on screen instead.
   */
  var pendingPhoneStart = false

  fun init(context: Context) {
    if (::core.isInitialized) return
    app = context.applicationContext
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    // Cached so the Watch opens in the right accent before the phone has
    // pushed anything this launch.
    core = WorkoutCore(this, prefs.getString(KEY_THEME, null))
    state.value = core.ui
  }

  private fun now() = System.currentTimeMillis()

  /** Every entry into the core goes through here, so the clock follows it. */
  private inline fun act(block: WorkoutCore.(Long) -> Unit) {
    core.block(now())
    scheduleTick()
  }

  // The clock

  private val tick = Runnable {
    core.tick(now())
    scheduleTick()
  }

  /**
   * One tick a second while there is something to count, phased so that a tick
   * lands on a rest's end date itself: the countdown changes on the second and
   * the buzz is not up to a second late.
   */
  private fun scheduleTick() {
    handler.removeCallbacks(tick)
    holdAwakeFor(core.restDeadline)
    if (!core.needsTicking) return
    val now = now()
    val deadline = core.restDeadline
    val delay = if (deadline != null && deadline > now) {
      ((deadline - now) % 1000).let { if (it == 0L) 1000L else it }
    } else {
      1000L
    }
    handler.postDelayed(tick, delay)
  }

  /**
   * Keeps the CPU up until a rest's end, so the buzz comes on time with the
   * wrist down and the screen off. A rest is minutes at most, and the lock
   * times out by itself a little after the end.
   */
  private fun holdAwakeFor(deadline: Long?) {
    val left = deadline?.minus(now()) ?: -1
    if (left <= 0) {
      wakeLock?.takeIf { it.isHeld }?.release()
      return
    }
    val lock = wakeLock ?: (app.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ischys:rest")
      .apply { setReferenceCounted(false) }
      .also { wakeLock = it }
    lock.acquire(left + 6_000)
  }

  // WorkoutCore.Host

  override val sessionRunning: Boolean get() = ExerciseService.running
  override val phoneReachable: Boolean get() = PhoneLink.canAskNow

  override fun onUiChanged(ui: UiState) {
    state.value = ui
  }

  override fun playRestHaptic() = Haptics.restOver(app)
  override fun playFailureHaptic() = Haptics.failure(app)
  override fun endSession(discard: Boolean) = ExerciseService.end(discard)
  override fun sendEnd() = PhoneLink.send(Wire.end())
  override fun sendFinishRequest(id: String) = PhoneLink.requestFinish(id)
  override fun queueEnd() = PhoneLink.queue(Wire.end())
  override fun requestState() = PhoneLink.send(Wire.requestState(), queueIfUnreachable = false)

  override fun persistTheme(id: String) {
    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_THEME, id).apply()
  }

  // From the phone (WearLinkService)

  fun onInbound(path: String, payload: ByteArray) {
    val json = try {
      JSONObject(String(payload, Charsets.UTF_8))
    } catch (e: Exception) {
      Log.w(TAG, "unreadable payload on $path")
      return
    }
    if (path == Wire.PATH_UNDELIVERABLE) {
      val id = json.optString("finishId", "")
      if (id.isNotEmpty()) act { finishUndeliverable(id) }
      return
    }
    when (val inbound = Wire.parseInbound(json)) {
      is Wire.Inbound.Command -> onCommand(inbound)
      is Wire.Inbound.Verdict -> act {
        inbound.verdict?.let { finishVerdict(it, inbound.finishId) }
        inbound.state?.let { apply(it, now()) }
      }
      is Wire.Inbound.State -> applyState(inbound.state)
    }
  }

  private fun applyState(s: PhoneState) = act { apply(s, it) }

  private fun onCommand(command: Wire.Inbound.Command) {
    if (command.cmd == "start") {
      // The phone began a workout: record it without the user opening anything.
      if (!ExerciseService.start(app, fromPhone = true)) pendingPhoneStart = true
      return
    }
    // A command queued while the Watch was out of reach can arrive after the
    // workout it was about is long over. It must not end the next one.
    val started = ExerciseService.sessionStart
    if (command.sentAt != null && started != null && command.sentAt < started) return
    pendingPhoneStart = false
    ExerciseService.dismissStartPrompt(app)
    // A stop is also how the phone says a finish the Watch asked for worked.
    act { phoneEnded(discard = command.cmd == "discard") }
  }

  fun onPhoneReachable(reachable: Boolean) = act { setPhoneReachable(reachable) }

  // From the session (ExerciseService)

  fun sessionStarted(sessionStart: Long) = act { sessionStarted(sessionStart, it) }
  fun sessionEnded() = act { sessionEnded() }
  fun setMetrics(heartRate: Int?, activeCal: Int?) = act { setMetrics(heartRate, activeCal) }
  fun setPaused(paused: Boolean) = act { setPaused(paused) }

  // From the screens

  fun startAppeared() = act { startAppeared() }

  fun startEmpty() {
    ExerciseService.start(app)
    PhoneLink.send(Wire.startEmpty())
  }

  fun startRoutine(id: String) {
    // The row holds a pending state while the phone spins the workout up.
    act { routineTapped(id) }
    ExerciseService.start(app)
    PhoneLink.send(Wire.startRoutine(id))
  }

  fun stepWeight(notches: Int) = act { stepWeight(notches, it) }
  fun stepReps(notches: Int) = act { stepReps(notches, it) }

  fun logSet() {
    val ui = core.ui
    PhoneLink.send(Wire.logSet(ui.weight, ui.reps, ui.unit))
  }

  // The phone owns the rest: every adjustment is sent to it and the corrected
  // rest is pushed straight back.
  fun adjustRest(seconds: Int) = PhoneLink.send(Wire.adjustRest(seconds))
  fun skipRest() = PhoneLink.send(Wire.skipRest())
  fun addSet() = PhoneLink.send(Wire.addSet())

  fun requestFinish() = act { requestFinish(UUID.randomUUID().toString(), it) }
  fun acknowledgeFinishFailed() = act { acknowledgeFinishFailed() }

  /**
   * No waiting for the phone here, unlike Finish: a discard keeps nothing, and
   * the phone leaves the workout whether or not its delete worked.
   */
  fun discard() {
    act { endSessionOrLeave(discard = true) }
    PhoneLink.send(Wire.discard())
  }

  fun togglePause() = ExerciseService.togglePause()
  fun leaveSummary() = act { leaveSummary() }

  /** A finish request could not be delivered (PhoneLink). */
  fun finishUndeliverable(id: String) = act { finishUndeliverable(id) }
}
