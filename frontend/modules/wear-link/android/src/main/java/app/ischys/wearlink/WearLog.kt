package app.ischys.wearlink

import android.util.Log

/**
 * What crosses the link, for diagnosing it on a real phone. Silent unless
 * asked for: `adb shell setprop log.tag.IschysLink DEBUG`.
 */
internal object WearLog {
  const val TAG = "IschysLink"

  inline fun d(message: () -> String) {
    if (Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, message())
  }

  /** A payload, cut short: a state push runs to kilobytes. */
  fun brief(json: String): String = if (json.length <= 240) json else json.take(240) + "…"
}
