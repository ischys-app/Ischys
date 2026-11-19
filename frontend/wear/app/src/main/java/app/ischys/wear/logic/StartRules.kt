package app.ischys.wear.logic

/**
 * What the Start screen lets you tap, and what it dims.
 *
 * Every start needs the phone in reach: the phone builds the workout and
 * logs its sets, and a start queued out of reach is dropped if Ischys is not
 * running there when it syncs. Out of reach, every row dims and cannot be
 * tapped. With the phone in reach every start is sent live, even
 * while Ischys is closed there: the phone then refuses it and the Watch is
 * told (phoneAppClosed), and a workout already running on the phone is
 * resumed. A hand-off in flight blocks a second start.
 */
data class StartRules(val reachable: Boolean, val handingOff: Boolean) {
  val canStartRoutine: Boolean get() = reachable && !handingOff

  val canStartEmpty: Boolean get() = reachable && !handingOff

  val emptyDimmed: Boolean get() = !canStartEmpty

  /** A hand-off dims all but its own row; otherwise out of reach dims them all. */
  fun routineDimmed(pending: Boolean): Boolean = if (handingOff) !pending else !reachable
}
