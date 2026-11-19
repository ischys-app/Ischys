package app.ischys.wear.logic

/**
 * What the Start screen lets you tap, and what it dims.
 *
 * A routine needs the phone in reach with Ischys running: the phone builds
 * the workout from it. An empty workout can start out of reach and syncs on
 * reconnect. While Ischys is closed on a phone in reach, nothing starts: the
 * phone refuses a start it cannot apply, so the Watch would record a workout
 * the phone never sees. A hand-off in flight blocks a second start.
 */
data class StartRules(val reachable: Boolean, val appClosed: Boolean, val handingOff: Boolean) {
  private val phoneReady = reachable && !appClosed

  val canStartRoutine: Boolean get() = phoneReady && !handingOff

  val canStartEmpty: Boolean get() = !handingOff && !(reachable && appClosed)

  val emptyDimmed: Boolean get() = !canStartEmpty

  /** A hand-off dims all but its own row; otherwise a phone not ready dims them all. */
  fun routineDimmed(pending: Boolean): Boolean = if (handingOff) !pending else !phoneReady
}
