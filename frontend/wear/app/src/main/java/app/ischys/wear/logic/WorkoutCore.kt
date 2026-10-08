package app.ischys.wear.logic

import kotlin.math.ceil
import kotlin.math.max

/** Everything the screens render. Replaced whole on every change. */
data class UiState(
  val screen: WatchScreen = WatchScreen.START,

  // Start
  val routines: List<RoutineItem> = emptyList(),
  /** Whether the phone app can be reached over the Data Layer right now. */
  val phoneReachable: Boolean = true,
  /** The routine just tapped, while the phone spins the workout up. */
  val pendingRoutineId: String? = null,

  // Active Set. `weight`/`reps` are editable here, seeded by the phone and
  // sent back on Log Set.
  val supersetLabel: String = "",
  val exerciseName: String = "",
  val equipment: String = "",
  val setNum: Int = 1,
  val setCount: Int = 1,
  val weight: String = "",
  val reps: String = "",
  val prevWeight: String = "",
  val prevReps: String = "",
  val setDots: List<SetDot> = emptyList(),
  /** "kg" or "lb" — the unit `weight`, `prevWeight` and `volume` are in. */
  val unit: String = "kg",

  // Rest. The phone owns the rest; `restRemaining` is counted down here to
  // the end date it pushed.
  val resting: Boolean = false,
  val restRemaining: Int = 0,
  val restTotal: Int = 0,
  val nextSetLabel: String = "",

  // Metrics. Heart rate and calories come from this Watch's session; volume
  // and sets from the phone.
  val routineName: String = "",
  val heartRate: Int = 0,
  val activeCal: Int = 0,
  val volume: Int = 0,
  val setsDone: Int = 0,
  val setsTotal: Int = 0,
  val elapsedSec: Int = 0,
  /** The session is paused from Controls. */
  val paused: Boolean = false,

  val summary: SessionSummary? = null,

  /** Finish was tapped and the phone has not answered yet. */
  val finishing: Boolean = false,
  /** The phone could not finish the workout. Shown until acknowledged. */
  val finishFailed: Boolean = false,

  /** Accent palette id, as the phone last pushed it. */
  val themeId: String? = null,
) {
  /**
   * Every planned set is logged, so the Active Set page shows the
   * end-of-workout state. `setsTotal` is 0 until the phone reports a plan, so
   * an empty workout never trips this on its own.
   */
  val allSetsDone: Boolean get() = setsTotal > 0 && setsDone >= setsTotal

  /** The rest countdown's final stretch. Only meaningful while resting. */
  val restFinal: Boolean get() = resting && restRemaining <= 10
}

/**
 * The Watch's state machine: a port of `WorkoutModel.swift` in the Apple Watch
 * target, with everything that touches Android behind `Host`.
 *
 * The phone is the source of truth. It pushes the workout state (`apply`); the
 * Watch owns only what is genuinely local — the rest countdown, the weight and
 * reps being adjusted before they are logged, and the live sensor metrics.
 *
 * Not thread-safe: every call is made on the main thread. `now` is epoch ms.
 */
class WorkoutCore(private val host: Host, themeId: String? = null) {
  /** What the state machine needs done for it. */
  interface Host {
    /** A session of this Watch's own is recording. */
    val sessionRunning: Boolean
    /** Whether a message sent now would be delivered now rather than queued. */
    val phoneReachable: Boolean
    fun onUiChanged(ui: UiState)
    fun playRestHaptic()
    fun playFailureHaptic()
    /** End the recording session. It reports back through `sessionEnded`. */
    fun endSession(discard: Boolean)
    /** Finish, sent now when the phone is in reach, queued otherwise. */
    fun sendEnd()
    /** Finish, with an id the phone's answer repeats. Never queued. */
    fun sendFinishRequest(id: String)
    /** Finish, queued for whenever the phone is next in reach. */
    fun queueEnd()
    fun requestState()
    fun persistTheme(id: String)
  }

  var ui = UiState(themeId = themeId)
    private set(value) {
      if (field == value) return
      field = value
      host.onUiChanged(value)
    }

  private fun update(change: (UiState) -> UiState) {
    ui = change(ui)
  }

  // Rest countdown

  /** When the running rest ends, as pushed by the phone. */
  private var restEndsAt: Long? = null
  private val restAlarm = RestAlarm()

  /** Where the elapsed clock counts from: the phone's `startedAt` once known. */
  private var elapsedOrigin: Long? = null

  // Edit arbitration

  /**
   * When the user last changed the weight or reps here. The phone is the
   * source of truth for both, but a value yanked out from under a wrist that
   * is mid-adjustment is worse than one a couple of seconds stale — so a
   * pushed edit waits for the wrist to go quiet.
   */
  private var lastLocalEdit: Long? = null

  private fun editIsBusy(now: Long): Boolean {
    val last = lastLocalEdit ?: return false
    return now - last < EDIT_GRACE_MS
  }

  private val finishHandshake = FinishHandshake()

  /** The send time of the newest state applied, on the phone's clock. */
  private var newestSentAt: Long? = null

  /** Whether the clock has anything to drive: the caller ticks while true. */
  val needsTicking: Boolean
    get() = elapsedOrigin != null && ui.screen == WatchScreen.SESSION ||
      restEndsAt != null || restAlarm.armedFor != null || finishHandshake.isWaiting

  /** The rest end being waited on, for the caller to phase its ticks to. */
  val restDeadline: Long? get() = restEndsAt ?: restAlarm.armedFor

  /** Whether an alert from the phone arriving now would repeat our own buzz. */
  fun ownsRestBuzz(now: Long): Boolean = restAlarm.owns(now)

  // Session lifecycle

  /** This Watch's session started recording. */
  fun sessionStarted(sessionStart: Long, now: Long) {
    // Only a seed: a `startedAt` already pushed by the phone is the better
    // origin and must not be thrown away by the session starting afterwards.
    if (elapsedOrigin == null) elapsedOrigin = sessionStart
    // Enter the workout the moment our own session starts rather than waiting
    // for the phone's push, which is racy at launch.
    update { it.copy(screen = WatchScreen.SESSION, paused = false) }
    tick(now)
    // The phone's first push may have been missed.
    host.requestState()
  }

  /** This Watch's session ended, for whatever reason. */
  fun sessionEnded() {
    stopTicking()
    finishSettled()
    // Leave the workout so the Watch cannot stay on the session screen if the
    // phone never pushes the next state.
    update { it.copy(screen = WatchScreen.START, paused = false, heartRate = 0, activeCal = 0) }
  }

  private fun stopTicking() {
    elapsedOrigin = null
    // A buzz for a rest in a workout that has ended would be wrong.
    restAlarm.cancel()
    restEndsAt = null
  }

  fun setMetrics(heartRate: Int?, activeCal: Int?) {
    update {
      it.copy(heartRate = heartRate ?: it.heartRate, activeCal = activeCal ?: it.activeCal)
    }
  }

  fun setPaused(paused: Boolean) = update { it.copy(paused = paused) }

  fun setPhoneReachable(reachable: Boolean) = update { it.copy(phoneReachable = reachable) }

  // Clock

  fun tick(now: Long) {
    val origin = elapsedOrigin
    if (origin != null) {
      val elapsed = max(0L, (now - origin) / 1000).toInt()
      update { it.copy(elapsedSec = elapsed) }
    }
    pollFinish(now)
    restTick(now)
  }

  /**
   * Derive the countdown from the end date and buzz if the rest just ran out.
   * Derived, never decremented: a counter loses however long the app was not
   * running, and the phone's pushed seconds stop arriving once its JS is
   * suspended.
   */
  private fun restTick(now: Long) {
    val end = restEndsAt
    if (end != null) {
      // Rounds up, as the phone does, so the two read the same second.
      val remaining = max(0, ceil((end - now) / 1000.0).toInt())
      update { it.copy(restRemaining = remaining, resting = remaining > 0) }
      if (remaining == 0) restEndsAt = null
    }
    if (restAlarm.poll(now)) host.playRestHaptic()
  }

  // Start screen

  /** The Start screen came up: never mid-handoff. */
  fun startAppeared() {
    update { it.copy(pendingRoutineId = null) }
    host.requestState()
  }

  fun routineTapped(id: String) = update { it.copy(pendingRoutineId = id) }

  /** Done on the summary. */
  fun leaveSummary() = update { it.copy(screen = WatchScreen.START) }

  // Editing the set

  /** Crown notches or stepper taps on the weight. */
  fun stepWeight(notches: Int, now: Long) {
    if (notches == 0) return
    lastLocalEdit = now
    update { it.copy(weight = Format.stepWeight(it.weight, notches, it.unit)) }
  }

  fun stepReps(notches: Int, now: Long) {
    if (notches == 0) return
    lastLocalEdit = now
    update { it.copy(reps = Format.stepReps(it.reps, notches)) }
  }

  // Finishing

  /**
   * Finish was tapped, on Controls or on the all-sets-done page. The phone
   * decides whether the workout is finished, so it is asked first and the
   * session keeps recording until it answers.
   */
  fun requestFinish(id: String, now: Long) {
    when (finishHandshake.begin(id, now, host.phoneReachable)) {
      FinishHandshake.Start.IGNORE -> return
      FinishHandshake.Start.END_NOW -> {
        // Out of reach: nothing would answer. The request is queued and the
        // phone finishes when it gets it.
        endSessionOrLeave(discard = false)
        host.sendEnd()
      }
      FinishHandshake.Start.ASK -> {
        update { it.copy(finishFailed = false, finishing = true) }
        host.sendFinishRequest(id)
      }
    }
  }

  /** The phone answered a finish request. */
  fun finishVerdict(verdict: FinishHandshake.Verdict, id: String) =
    perform(finishHandshake.verdict(verdict, id))

  /** A finish request could not be delivered. */
  fun finishUndeliverable(id: String) = perform(finishHandshake.undeliverable(id))

  /**
   * The workout was closed from the phone, or our session ended: whatever was
   * being waited on is settled.
   */
  fun finishSettled() {
    finishHandshake.cancel()
    update { it.copy(finishing = false, finishFailed = false) }
  }

  fun acknowledgeFinishFailed() = update { it.copy(finishFailed = false) }

  private fun pollFinish(now: Long) {
    if (!finishHandshake.isWaiting) return
    perform(finishHandshake.poll(now))
  }

  /**
   * Ends the recording, which takes the Watch back to Start when the session
   * reports it has ended. With no session running nothing would report, so
   * leave here instead.
   */
  fun endSessionOrLeave(discard: Boolean) {
    if (host.sessionRunning) {
      host.endSession(discard)
    } else {
      finishSettled()
      stopTicking()
      update { it.copy(screen = WatchScreen.START) }
    }
  }

  /** The phone ended the workout: `stop` keeps the session's numbers, `discard` drops them. */
  fun phoneEnded(discard: Boolean) {
    finishSettled()
    endSessionOrLeave(discard)
  }

  private fun perform(step: FinishHandshake.Step) {
    when (step) {
      FinishHandshake.Step.NONE -> return
      FinishHandshake.Step.END_AND_SAVE -> {
        update { it.copy(finishing = false) }
        endSessionOrLeave(discard = false)
      }
      FinishHandshake.Step.END_AND_QUEUE_REQUEST -> {
        update { it.copy(finishing = false) }
        endSessionOrLeave(discard = false)
        host.queueEnd()
      }
      FinishHandshake.Step.KEEP_RECORDING -> {
        update { it.copy(finishing = false, finishFailed = true) }
        host.playFailureHaptic()
      }
      // The session ended when the wait ran out. Only the request is still
      // owed to the phone.
      FinishHandshake.Step.QUEUE_REQUEST -> host.queueEnd()
    }
  }

  // Mirroring

  /**
   * Merge a state pushed by the phone. Only the fields the phone owns are
   * overwritten; locally edited weight/reps are replaced only when the set
   * changed, the phone edited them, or the unit switched.
   */
  fun apply(s: PhoneState, now: Long) {
    // A state the phone wrote to a data item while the Watch was out of reach
    // can sync after newer ones have already arrived as messages. Both carry
    // the phone's send time, so the older one is recognised and ignored. Only
    // within a window: a phone whose clock was set back must not be shut out.
    val sent = s.sentAt
    if (sent != null) {
      val newest = newestSentAt
      if (newest != null && sent < newest && newest - sent < STALE_WINDOW_MS) return
      newestSentAt = sent
    }

    s.themeId?.let { id ->
      if (id != ui.themeId) host.persistTheme(id)
    }

    // The workout's own start beats our session's.
    val originChanged = s.startedAt != null && s.startedAt != elapsedOrigin
    if (originChanged) elapsedOrigin = s.startedAt

    val before = ui
    // A changed exercise/set always reseeds the editable values.
    val setChanged = s.exerciseName != before.exerciseName || s.setNum != before.setNum
    // So does an edit the phone made to the set we are already on, unless the
    // wrist is mid-adjustment; that edit lands once it goes quiet.
    val pushedEdit =
      !setChanged && !editIsBusy(now) && (s.weight != before.weight || s.reps != before.reps)
    // A unit switch replaces the number outright: relabelling it without
    // replacing it would show (and log) pounds as kilograms.
    val unitChanged = s.unit != null && s.unit != before.unit
    val reseed = setChanged || pushedEdit || unitChanged
    if (setChanged || unitChanged) lastLocalEdit = null

    // Rest is phone-authoritative: it says whether one is running and when it
    // ends. With an end date the countdown is derived from it; without one the
    // pushed seconds are shown as they are.
    val end = if (s.resting) s.restEndsAt else null
    restEndsAt = end

    update {
      it.copy(
        screen = s.screen,
        // Once the phone has moved us off Start, any pending hand-off is resolved.
        pendingRoutineId = if (s.screen != WatchScreen.START) null else it.pendingRoutineId,
        // A "couldn't finish" belongs to the workout it was about.
        finishFailed = if (s.screen != WatchScreen.SESSION) false else it.finishFailed,
        // Only when the push actually carried them; mid-workout pushes don't.
        routines = s.routines ?: it.routines,
        routineName = s.routineName,
        equipment = s.equipment,
        supersetLabel = s.supersetLabel,
        setCount = s.setCount,
        prevWeight = s.prevWeight,
        prevReps = s.prevReps,
        setDots = s.setDots,
        nextSetLabel = s.nextSetLabel,
        restTotal = s.restTotal,
        volume = s.volume,
        setsDone = s.setsDone,
        setsTotal = s.setsTotal,
        summary = s.summary,
        unit = s.unit ?: it.unit,
        weight = if (reseed) s.weight else it.weight,
        reps = if (reseed) s.reps else it.reps,
        exerciseName = s.exerciseName,
        setNum = s.setNum,
        resting = if (end == null) s.resting else it.resting,
        restRemaining = if (end == null) s.restRemaining else it.restRemaining,
        themeId = s.themeId ?: it.themeId,
      )
    }

    // Every push goes through the alarm, which is what makes a repeated push
    // harmless, a skip silent, and an adjusted rest buzz at its new end.
    if (restAlarm.update(s.resting, s.restEndsAt, s.restAlerts, now)) host.playRestHaptic()
    // At once rather than at the next tick, so a Watch joining a workout
    // already running does not show a wrong clock for a second.
    if (originChanged || end != null) tick(now)
  }

  companion object {
    const val EDIT_GRACE_MS = 3_000L
    const val STALE_WINDOW_MS = 10 * 60_000L
  }
}
