package app.ischys.wear.logic

import org.json.JSONObject

/**
 * The Data Layer protocol between the phone and the Watch.
 *
 * Payloads are UTF-8 JSON in the shapes the Apple Watch link already uses —
 * the state of src/lib/watchState.ts one way, the `WatchAction`s of
 * modules/health/index.ts the other — so the phone's JS does not care which
 * kind of watch is on the wrist. Only the transport differs: paths on the
 * Wearable Data Layer instead of WatchConnectivity calls.
 *
 * The same constants are declared in the phone module
 * (modules/wear-link/android/.../WearPaths.kt). Change the two together.
 */
object Wire {
  /** Phone → Watch. The latest state: a message, or a data item when out of reach. */
  const val PATH_STATE = "/ischys/state"
  /** Phone → Watch. `{cmd: start|stop|discard}`: a message, or a data item when queued. */
  const val PATH_COMMAND = "/ischys/command"
  /**
   * Phone → Watch. The phone app is not running to act on what was sent:
   * `{finishId}` for a finish, `{action}` for a start or a request for state.
   */
  const val PATH_UNDELIVERABLE = "/ischys/undeliverable"
  /** Watch → phone. One action, live. */
  const val PATH_ACTION = "/ischys/action"
  /** Watch → phone. Prefix of the data items holding actions queued while out of reach. */
  const val PATH_QUEUED = "/ischys/queued"
  /** Watch → phone. `{metrics, hr, cal}`: a message, sent only while the phone is in reach. */
  const val PATH_METRICS = "/ischys/metrics"

  /** Advertised by the phone app; how the Watch knows the phone is in reach. */
  const val CAPABILITY_PHONE = "ischys_phone"
  /** Advertised by this app; how the phone finds a Watch that has it installed. */
  const val CAPABILITY_WATCH = "ischys_watch"

  // Watch → phone

  /** `unit` is the unit `weight` is in — the one the Watch was showing. */
  fun logSet(weight: String, reps: String, unit: String): JSONObject =
    action("logSet").put("weight", weight).put("reps", reps).put("unit", unit)

  fun adjustRest(seconds: Int): JSONObject = action("adjustRest").put("seconds", seconds)
  fun skipRest(): JSONObject = action("skipRest")
  /** Finish, from a Watch that has already ended its session. */
  fun end(): JSONObject = action("end")
  /** Finish, from a Watch that keeps recording until the phone answers. */
  fun endAsking(finishId: String): JSONObject = action("end").put("finishId", finishId)
  fun discard(): JSONObject = action("discard")
  fun addSet(): JSONObject = action("addSet")
  fun startEmpty(): JSONObject = action("startEmpty")
  fun startRoutine(id: String): JSONObject = action("startRoutine").put("routineId", id)
  fun requestState(): JSONObject = action("requestState")

  /**
   * What the session measured, sent once when it ends and is kept. Wear OS has
   * no on-watch health store to save a workout into, so this takes the place
   * of the Apple Watch's `workoutSaved`: the phone is the one that writes.
   */
  fun sessionMetrics(
    startedAt: Long,
    endedAt: Long,
    avgHr: Int,
    maxHr: Int,
    cal: Int,
  ): JSONObject = action("sessionMetrics")
    .put("startedAt", startedAt)
    .put("endedAt", endedAt)
    .put("avgHr", avgHr)
    .put("maxHr", maxHr)
    .put("cal", cal)

  fun metrics(hr: Int, cal: Int): JSONObject =
    JSONObject().put("metrics", true).put("hr", hr).put("cal", cal)

  private fun action(name: String): JSONObject = JSONObject().put("action", name)

  // Phone → Watch

  /** What a payload from the phone is. */
  sealed interface Inbound {
    /** The phone ended (or started) the session on the user's behalf. */
    data class Command(val cmd: String, val sentAt: Long?) : Inbound

    /**
     * The phone's answer to a finish request. `state` is the workout state it
     * travelled with, or null when it came on its own — which is not a state
     * at all, and decoding it as one would blank the session screen.
     */
    data class Verdict(
      val verdict: FinishHandshake.Verdict?,
      val finishId: String,
      val state: PhoneState?,
    ) : Inbound

    data class State(val state: PhoneState) : Inbound
  }

  fun parseInbound(d: JSONObject): Inbound {
    val cmd = d.optString("cmd", "")
    if (cmd.isNotEmpty()) {
      val sentAt = d.optDouble("sentAt", 0.0)
      return Inbound.Command(cmd, if (sentAt > 0) sentAt.toLong() else null)
    }
    val rawVerdict = d.optString("finishVerdict", "")
    val finishId = d.optString("finishId", "")
    if (rawVerdict.isNotEmpty() && finishId.isNotEmpty()) {
      return Inbound.Verdict(
        verdict = FinishHandshake.Verdict.fromWire(rawVerdict),
        finishId = finishId,
        state = if (d.has("screen")) PhoneState.from(d) else null,
      )
    }
    return Inbound.State(PhoneState.from(d))
  }
}
