package app.ischys.wear.logic

/**
 * Decides when the wrist buzzes for the end of a rest. A port of
 * `RestAlarm.swift` in the Apple Watch target; the reasoning lives there.
 *
 * It keys on the rest's end date (epoch ms), never on the pushed seconds
 * remaining, so a repeated push cannot buzz twice and an adjusted rest is just
 * a different date to wait for. No timer and no vibrator: the caller feeds it
 * every pushed state and every clock tick, and buzzes when a call returns true.
 */
class RestAlarm {
  /** The end date being waited for, if any. */
  var armedFor: Long? = null
    private set

  /** The last end date dealt with, buzzed or deliberately not. */
  private var handled: Long? = null
  private var firedAt: Long? = null

  /** Feed a state pushed by the phone. True when the wrist should buzz now. */
  fun update(resting: Boolean, endsAt: Long?, alertsOn: Boolean, now: Long): Boolean {
    if (!alertsOn) {
      armedFor = null
      return false
    }
    if (!resting || endsAt == null) return restEnded(now)
    // The same rest pushed again after we already buzzed for it.
    if (endsAt == handled) {
      armedFor = null
      return false
    }
    armedFor = endsAt
    return poll(now)
  }

  /** Feed a clock tick. True when the wrist should buzz now. */
  fun poll(now: Long): Boolean {
    val end = armedFor ?: return false
    if (now < end) return false
    armedFor = null
    return complete(end, now)
  }

  /** Drop whatever is pending without buzzing — the workout ended. */
  fun cancel() {
    armedFor = null
  }

  /** Whether a rest alert from the phone arriving now would repeat our own buzz. */
  fun owns(now: Long): Boolean {
    if (armedFor != null) return true
    val fired = firedAt ?: return false
    return kotlin.math.abs(now - fired) <= OWNERSHIP_WINDOW_MS
  }

  /**
   * The phone says no rest is running. Skipped or cancelled, unless it is the
   * armed rest finishing a moment ahead of our own timer.
   */
  private fun restEnded(now: Long): Boolean {
    val end = armedFor ?: return false
    armedFor = null
    if (now < end - COMPLETION_SLACK_MS) return false
    return complete(end, now)
  }

  private fun complete(end: Long, now: Long): Boolean {
    handled = end
    if (now - end > MAX_LATENESS_MS) return false
    firedAt = now
    return true
  }

  companion object {
    /** How close to the end a "rest is over" push counts as the rest running out. */
    const val COMPLETION_SLACK_MS = 1_000L
    /** A buzz this long after the fact is noise, not a cue. */
    const val MAX_LATENESS_MS = 5_000L
    const val OWNERSHIP_WINDOW_MS = 10_000L
  }
}
