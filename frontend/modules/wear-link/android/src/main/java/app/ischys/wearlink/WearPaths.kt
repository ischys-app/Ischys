package app.ischys.wearlink

/**
 * The Data Layer paths and capabilities shared with the Wear OS app, which
 * declares the same constants in wear/app/.../logic/Wire.kt. Change the two
 * together. Every payload is UTF-8 JSON.
 */
internal object WearPaths {
  /** Phone → Watch. The latest state: a message, or a data item when out of reach. */
  const val STATE = "/ischys/state"
  /** Phone → Watch. `{cmd: start|stop|discard, sentAt}`. */
  const val COMMAND = "/ischys/command"
  /**
   * Phone → Watch. The app is not running to act on what was sent: `{finishId}`
   * for a finish, `{action}` for anything else.
   */
  const val UNDELIVERABLE = "/ischys/undeliverable"
  /** Watch → phone. One action, live. */
  const val ACTION = "/ischys/action"
  /** Watch → phone. Prefix of the data items holding actions queued out of reach. */
  const val QUEUED = "/ischys/queued"
  /** Watch → phone. `{metrics, hr, cal}`: a message, sent only while the phone is in reach. */
  const val METRICS = "/ischys/metrics"

  /** Advertised by this app (res/values/wear.xml). */
  const val CAPABILITY_PHONE = "ischys_phone"
  /** Advertised by the Wear OS app; how a Watch with Ischys installed is found. */
  const val CAPABILITY_WATCH = "ischys_watch"
}
