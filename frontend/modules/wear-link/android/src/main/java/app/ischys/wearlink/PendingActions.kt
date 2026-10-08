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

  enum class Fate {
    /** Hold it for JS to drain. */
    BUFFER,
    /**
     * A finish the Watch is waiting on an answer to, with no app running to
     * give one. The Watch is told at once, and sends a plain finish instead.
     */
    REFUSE,
    /** Only meaningful to a workout screen that is on screen now. */
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
    return if (name in completing || name in sessionReports) Fate.BUFFER else Fate.DROP
  }
}
