package app.ischys.wear.logic

/**
 * What the Start screen lets you tap, and what it dims.
 *
 * A routine needs the phone in reach: the phone builds the workout from it,
 * so out of reach its row dims and cannot be tapped. An empty workout can
 * start out of reach. With the phone in reach every start is sent live, even
 * while Ischys is closed there: the phone then refuses it and the Watch is
 * told (phoneAppClosed), and a workout already running on the phone is
 * resumed. A hand-off in flight blocks a second start.
 */
data class StartRules(val reachable: Boolean, val handingOff: Boolean) {
  val canStartRoutine: Boolean get() = reachable && !handingOff

  val canStartEmpty: Boolean get() = !handingOff

  val emptyDimmed: Boolean get() = handingOff

  /** A hand-off dims all but its own row; otherwise out of reach dims them all. */
  fun routineDimmed(pending: Boolean): Boolean = if (handingOff) !pending else !reachable
}
