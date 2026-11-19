package app.ischys.wear.logic

import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Active calories from the total the Watch measures.
 *
 * Health Services only reports total calories, which include what the body
 * burns at rest anyway. An Apple Watch records active energy, and Health
 * Connect takes the phone's entry as active calories, so the resting part is
 * taken off: 1 kcal per kg of bodyweight per hour (1 MET, the usual estimate
 * of resting burn) over the session's active, unpaused time.
 *
 * Null without a bodyweight: there is then no honest active number.
 */
object ActiveCalories {
  const val RESTING_KCAL_PER_KG_HOUR = 1.0
  private const val HOUR_MS = 3_600_000.0

  fun of(totalKcal: Double, activeMillis: Long, bodyweightKg: Double): Int? {
    if (totalKcal.isNaN() || activeMillis < 0 || !(bodyweightKg > 0)) return null
    val resting = bodyweightKg * RESTING_KCAL_PER_KG_HOUR * (activeMillis / HOUR_MS)
    return max(0.0, totalKcal - resting).roundToInt()
  }
}
