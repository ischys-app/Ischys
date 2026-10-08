package app.ischys.wear.logic

import org.json.JSONObject

enum class WatchScreen {
  START,   // pick a routine / empty
  SESSION, // the paged workout
  SUMMARY,
}

enum class SetDot { DONE, ACTIVE, PENDING }

data class RoutineItem(
  val id: String,
  val name: String,
  val initials: String,
  val exerciseCount: Int,
)

data class SessionSummary(
  val routineName: String,
  val dateLabel: String,
  val timeLabel: String,
  /** Already in `unit`. */
  val volume: Int,
  val unit: String,
  val sets: Int,
  val avgHr: Int,
  val activeCal: Int,
  val prs: Int,
)

/**
 * The workout state the phone pushes to the Watch: the `WatchState` that
 * src/lib/watchState.ts builds, as JSON. The same shape the Apple Watch
 * decodes in `PhoneLink.swift`.
 *
 * Decoded leniently: any missing field falls back, so a partial push never
 * throws and blanks the screen. Times are epoch ms.
 */
data class PhoneState(
  val screen: WatchScreen = WatchScreen.START,
  /**
   * null when the push didn't carry routines at all, which is different from
   * carrying none: a session push has no `routines` key.
   */
  val routines: List<RoutineItem>? = null,
  /** When the workout began. null when the phone hasn't said (it pushes 0). */
  val startedAt: Long? = null,
  val routineName: String = "",
  val exerciseName: String = "",
  val equipment: String = "",
  /** "SUPERSET A · 1 OF 2", or empty when the exercise stands alone. */
  val supersetLabel: String = "",
  val setNum: Int = 1,
  val setCount: Int = 1,
  val weight: String = "",
  val reps: String = "",
  val prevWeight: String = "",
  val prevReps: String = "",
  val setDots: List<SetDot> = emptyList(),
  val resting: Boolean = false,
  val restRemaining: Int = 0,
  val restTotal: Int = 0,
  /** When the running rest ends. null when not resting or not said (0). */
  val restEndsAt: Long? = null,
  /** The phone's `rest_timer_alerts` setting. Absent reads as off. */
  val restAlerts: Boolean = false,
  val nextSetLabel: String = "",
  /** "kg" or "lb"; null when the push didn't carry one, so the last one stands. */
  val unit: String? = null,
  /** Session volume, already in `unit`. */
  val volume: Int = 0,
  val setsDone: Int = 0,
  val setsTotal: Int = 0,
  val summary: SessionSummary? = null,
  /** Accent palette id; null when the push didn't carry one. */
  val themeId: String? = null,
  /** When the phone sent this, on the phone's clock. null when it did not say. */
  val sentAt: Long? = null,
) {
  companion object {
    fun from(d: JSONObject): PhoneState {
      // Anything but the two known units is ignored rather than shown.
      val unit = d.optString("unit", "").takeIf { it == "kg" || it == "lb" }
      return PhoneState(
        screen = when (d.optString("screen", "")) {
          "session" -> WatchScreen.SESSION
          "summary" -> WatchScreen.SUMMARY
          else -> WatchScreen.START
        },
        routines = d.optJSONArray("routines")?.let { rs ->
          (0 until rs.length()).mapNotNull { rs.optJSONObject(it) }.map {
            RoutineItem(
              id = it.optString("id", ""),
              name = it.optString("name", ""),
              initials = it.optString("initials", ""),
              exerciseCount = it.optInt("exerciseCount", 0),
            )
          }
        },
        startedAt = epochMs(d, "startedAt"),
        routineName = d.optString("routineName", ""),
        exerciseName = d.optString("exerciseName", ""),
        equipment = d.optString("equipment", ""),
        supersetLabel = d.optString("supersetLabel", ""),
        setNum = d.optInt("setNum", 1),
        setCount = d.optInt("setCount", 1),
        weight = d.optString("weight", ""),
        reps = d.optString("reps", ""),
        prevWeight = d.optString("prevWeight", ""),
        prevReps = d.optString("prevReps", ""),
        setDots = d.optJSONArray("setDots")?.let { dots ->
          (0 until dots.length()).map {
            when (dots.optString(it)) {
              "done" -> SetDot.DONE
              "active" -> SetDot.ACTIVE
              else -> SetDot.PENDING
            }
          }
        } ?: emptyList(),
        resting = d.optBoolean("resting", false),
        restRemaining = d.optInt("restRemaining", 0),
        restTotal = d.optInt("restTotal", 0),
        restEndsAt = epochMs(d, "restEndsAt"),
        restAlerts = d.optBoolean("restAlerts", false),
        nextSetLabel = d.optString("nextSetLabel", ""),
        unit = unit,
        volume = d.optInt("volume", 0),
        setsDone = d.optInt("setsDone", 0),
        setsTotal = d.optInt("setsTotal", 0),
        summary = d.optJSONObject("summary")?.let { s ->
          SessionSummary(
            routineName = s.optString("routineName", ""),
            dateLabel = s.optString("dateLabel", ""),
            timeLabel = s.optString("timeLabel", ""),
            volume = s.optInt("volume", 0),
            unit = unit ?: "kg",
            sets = s.optInt("sets", 0),
            avgHr = s.optInt("avgHr", 0),
            activeCal = s.optInt("activeCal", 0),
            prs = s.optInt("prs", 0),
          )
        },
        themeId = d.optString("themeId", "").takeIf { it.isNotEmpty() },
        sentAt = epochMs(d, "sentAt"),
      )
    }

    /** An epoch-ms field; null when absent or not positive. */
    private fun epochMs(d: JSONObject, key: String): Long? {
      val ms = d.optDouble(key, 0.0)
      return if (ms.isNaN() || ms <= 0) null else ms.toLong()
    }
  }
}
