package app.ischys.wear.logic

/**
 * What the Watch does between Finish being tapped and the phone saying how the
 * finish went. A port of `FinishHandshake.swift` in the Apple Watch target;
 * the reasoning lives there and the two must behave the same.
 *
 * The Watch asks first and keeps recording until it hears. This holds that
 * rule and nothing else — no timer, no Data Layer, no Health Services — so it
 * runs in a JVM unit test. The caller feeds it the tap, the phone's answer and
 * the clock (epoch ms), and does what each call returns.
 */
class FinishHandshake {
  /** The phone's answer, as it travels (`finishVerdict` in the message). */
  enum class Verdict(val wire: String) {
    FINISHED("finished"),
    FAILED("failed");

    companion object {
      fun fromWire(raw: String?): Verdict? = entries.firstOrNull { it.wire == raw }
    }
  }

  /** What to do when Finish is tapped. */
  enum class Start {
    /** Send the request with this id and show that the finish is under way. */
    ASK,
    /** The phone cannot be asked. End now and queue the request. */
    END_NOW,
    /** Already waiting on an earlier tap. */
    IGNORE,
  }

  /** What to do after an answer, a clock tick or a delivery failure. */
  enum class Step {
    NONE,
    /** End the session. */
    END_AND_SAVE,
    /** As `END_AND_SAVE`, and queue the finish request: the phone never got it. */
    END_AND_QUEUE_REQUEST,
    /** The finish failed on the phone. Leave the session running and say so. */
    KEEP_RECORDING,
    /** Queue the finish request only: the session ended when the wait ran out. */
    QUEUE_REQUEST,
  }

  /** The request being waited on, if any. */
  private var pending: String? = null

  /** When to stop waiting. null when not waiting. */
  var deadline: Long? = null
    private set

  /** The request the wait ran out on, until it is known whether the phone got it. */
  private var gaveUpOn: String? = null

  val isWaiting: Boolean get() = pending != null

  fun begin(id: String, now: Long, phoneReachable: Boolean): Start {
    if (pending != null) return Start.IGNORE
    if (!phoneReachable) return Start.END_NOW
    pending = id
    deadline = now + VERDICT_TIMEOUT_MS
    gaveUpOn = null
    return Start.ASK
  }

  /** The phone answered request `id`. */
  fun verdict(verdict: Verdict, id: String): Step {
    // An answer, however late, means the phone has the request.
    if (id == gaveUpOn) gaveUpOn = null
    if (id != pending) return Step.NONE
    settle()
    return when (verdict) {
      Verdict.FINISHED -> Step.END_AND_SAVE
      Verdict.FAILED -> Step.KEEP_RECORDING
    }
  }

  /** Feed a clock tick. Ends the wait once the deadline has passed. */
  fun poll(now: Long): Step {
    val waitingOn = pending ?: return Step.NONE
    val until = deadline ?: return Step.NONE
    if (now < until) {
      // The clock can be set back while waiting; the deadline is never more
      // than the timeout away.
      val latest = now + VERDICT_TIMEOUT_MS
      if (until > latest) deadline = latest
      return Step.NONE
    }
    settle()
    gaveUpOn = waitingOn
    return Step.END_AND_SAVE
  }

  /** Request `id` could not be delivered after all, so no answer is coming. */
  fun undeliverable(id: String): Step {
    if (id == gaveUpOn) {
      gaveUpOn = null
      return Step.QUEUE_REQUEST
    }
    if (id != pending) return Step.NONE
    settle()
    return Step.END_AND_QUEUE_REQUEST
  }

  /** The session ended some other way, so there is nothing left to wait for. */
  fun cancel() = settle()

  private fun settle() {
    pending = null
    deadline = null
  }

  companion object {
    /**
     * How long to wait for the phone's answer before ending anyway. Mirrors
     * `WATCH_VERDICT_TIMEOUT_MS` in src/lib/watchFinish.ts and
     * `FinishHandshake.verdictTimeout` in the Apple Watch target.
     */
    const val VERDICT_TIMEOUT_MS = 8_000L
  }
}
