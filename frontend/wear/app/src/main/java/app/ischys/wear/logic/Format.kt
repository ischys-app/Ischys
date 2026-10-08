package app.ischys.wear.logic

import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToLong

/** Display and stepping rules shared by the screens. Pure, so they are tested. */
object Format {
  /**
   * A weight for the wrist: one decimal at most ("149.91" → "149.9", "225" →
   * "225"). Display only — the value logged stays the exact string the phone
   * sent.
   */
  fun shortWeight(text: String): String {
    val v = parse(text) ?: return text
    val r = (v * 10).roundToLong() / 10.0
    return if (r == Math.rint(r)) r.toLong().toString() else String.format(Locale.US, "%.1f", r)
  }

  /** Seconds → "M:SS". Minutes run past 60 for long sessions, which is fine. */
  fun clock(seconds: Int): String {
    val s = max(0, seconds)
    return String.format(Locale.US, "%d:%02d", s / 60, s % 60)
  }

  /** 9200 → "9.2k"; small values stay plain. */
  fun volume(v: Int): String =
    if (v >= 1000) String.format(Locale.US, "%.1fk", v / 1000.0) else v.toString()

  /** 9177 → "9,177". */
  fun grouped(n: Int): String = String.format(Locale.US, "%,d", n)

  /**
   * One notch of the crown or one tap of a stepper on the weight field: 0.5 kg,
   * or 2.5 lb — the smallest change a lb plate set can make.
   */
  fun weightStep(unit: String): Double = if (unit == "lb") 2.5 else 0.5

  /**
   * `text` moved by `notches` steps and snapped to the unit's grid, so a
   * pushed value off it (220.46 lb from a kilogram-era set) lands on it at the
   * first notch. Whole numbers print plain, halves with one decimal.
   */
  fun stepWeight(text: String, notches: Int, unit: String): String {
    val step = weightStep(unit)
    val moved = max(0.0, (parse(text) ?: 0.0) + notches * step)
    val w = Math.rint(moved / step) * step
    return if (w == Math.rint(w)) w.toLong().toString() else w.toString()
  }

  fun stepReps(text: String, notches: Int): String {
    val moved = max(0.0, Math.rint(parse(text) ?: 0.0) + notches)
    return moved.toLong().toString()
  }

  /** A comma-locale keyboard on the phone yields "24,8". */
  private fun parse(text: String): Double? = text.replace(',', '.').toDoubleOrNull()
}
