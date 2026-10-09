package app.ischys.wear.link

import android.util.Log
import app.ischys.wear.BuildConfig

/**
 * What crosses the link, for diagnosing it on a real Watch. Always on in a
 * debug build; in a release one only when asked for:
 * `adb shell setprop log.tag.IschysLink DEBUG`.
 */
object LinkLog {
  const val TAG = "IschysLink"

  inline fun d(message: () -> String) {
    if (BuildConfig.DEBUG || Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, message())
  }

  /** A payload, cut short: a state push runs to kilobytes. */
  fun brief(text: String): String = if (text.length <= 240) text else text.take(240) + "…"
}
