package app.ischys.wear.logic

/**
 * Holds work back until something is known, then runs it in order; after that
 * runs everything at once.
 *
 * The phone link uses it for whether the phone is in reach. That is an
 * asynchronous lookup, and a process Google Play services has just started —
 * for a workout begun on the phone, say — sends before it has come back. Sent
 * then, a message would be taken for "out of reach" and dropped or queued,
 * when the phone is right there.
 *
 * Not thread-safe: one thread only.
 */
class UntilKnown {
  private var known = false
  private val waiting = ArrayList<() -> Unit>()

  fun run(work: () -> Unit) {
    if (known) work() else waiting += work
  }

  /** The answer is in. Runs what was held, oldest first. Only the first call does anything. */
  fun nowKnown() {
    if (known) return
    known = true
    val held = ArrayList(waiting)
    waiting.clear()
    held.forEach { it() }
  }
}
