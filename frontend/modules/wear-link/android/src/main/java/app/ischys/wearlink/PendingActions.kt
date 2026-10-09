package app.ischys.wearlink

import org.json.JSONObject

/**
 * Which Watch actions are worth keeping when nothing in JS can hear them.
 *
 * Pure, so it can be reasoned about (and tested) apart from the service.
 */
internal object PendingActions {
  /**
   * Actions that end a workout. Losing one strands the workout as active on
   * the phone after the user finished it on the wrist, and nothing re-sends it.
   */
  private val completing = setOf("end", "discard")

  /**
   * What the Watch's session measured, sent once as it ends. `workoutSaved` is
   * the Apple Watch's confirmation; kept here so the two links buffer alike.
   */
  private val sessionReports = setOf("sessionMetrics", "workoutSaved")

  /**
   * Actions that begin a workout. One held for later would start a workout
   * whenever the app was next opened, long after the user gave up on it.
   */
  private val starting = setOf("startEmpty", "startRoutine")

  /** Everything else the Watch sends: it acts on, or asks about, the workout on screen. */
  private val live = setOf("logSet", "adjustRest", "skipRest", "addSet", "requestState")

  enum class Fate {
    /** Hold it for JS to drain. */
    BUFFER,
    /**
     * Nothing here can act on it, and the Watch is told at once rather than
     * left to think it worked. For a finish it is waiting on an answer to, it
     * then sends a plain finish instead, which is held. For anything else it
     * asks the user to open Ischys on the phone: unlike on iOS, a message from
     * the Watch wakes only this listener, never the app.
     */
    REFUSE,
    /** The app is coming up and will push its state in a moment; nothing to say. */
    DROP,
  }

  /**
   * `appRunning`: the React app exists in this process (it may still be
   * loading). False when the process was started for the listener alone.
   */
  fun fate(action: JSONObject, appRunning: Boolean): Fate {
    val name = action.optString("action", "")
    if (name == "end" && action.optString("finishId", "").isNotEmpty() && !appRunning) {
      return Fate.REFUSE
    }
    if (name in completing || name in sessionReports) return Fate.BUFFER
    if (name in starting) return Fate.REFUSE
    if (name in live) return if (appRunning) Fate.DROP else Fate.REFUSE
    // Not something the Watch sends.
    return Fate.DROP
  }
}
