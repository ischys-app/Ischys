package app.ischys.wearlink

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Where what the Watch sends meets JS. The listener service and the Expo
 * module live in the same process but have separate lifetimes: Google Play
 * services can start the process for the service alone, with no React app in
 * it. So the service hands everything here, and this decides whether there is
 * anyone to emit to.
 *
 * Workout-ending actions that nothing could hear are kept on disk, not in
 * memory: with no app running, the process this lives in can be gone again
 * long before the user next opens Ischys.
 */
internal object WearLinkHub {
  private const val PREFS = "wear_link"
  private const val KEY_PENDING = "pending"

  private val main = Handler(Looper.getMainLooper())
  private val lock = Any()
  private var emit: ((event: String, body: Map<String, Any?>) -> Unit)? = null
  /** False until JS first drains, which is the only proof a listener exists. */
  private var jsListening = false

  /** The module came up: there is a React app to emit to once it listens. */
  fun attach(emitter: (event: String, body: Map<String, Any?>) -> Unit) = synchronized(lock) {
    emit = emitter
    jsListening = false
  }

  fun detach() = synchronized(lock) {
    emit = null
    jsListening = false
  }

  /**
   * Hands JS the buffered actions, oldest first, and marks it live, so later
   * ones are emitted rather than queued. Called from the root layout on mount.
   */
  fun drain(context: Context): List<String> = synchronized(lock) {
    jsListening = true
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val stored = prefs.getString(KEY_PENDING, null) ?: return emptyList()
    prefs.edit().remove(KEY_PENDING).apply()
    val pending = JSONArray(stored)
    List(pending.length()) { pending.getString(it) }
  }

  /**
   * An action from the Watch. Returns true when the Watch should be told the
   * finish it asked about cannot be answered (see `PendingActions.Fate.REFUSE`).
   */
  fun onAction(context: Context, json: String): Boolean {
    val action = try {
      JSONObject(json)
    } catch (e: Exception) {
      return false
    }
    synchronized(lock) {
      val emitter = emit
      if (emitter != null && jsListening) {
        // Expo events are emitted from the main thread.
        main.post { emitter("onWatchAction", mapOf("json" to json)) }
        return false
      }
      return when (PendingActions.fate(action, appRunning = emitter != null)) {
        PendingActions.Fate.REFUSE -> true
        PendingActions.Fate.DROP -> false
        PendingActions.Fate.BUFFER -> {
          val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          val pending = JSONArray(prefs.getString(KEY_PENDING, null) ?: "[]").put(json)
          // commit, not apply: the process may not outlive this call by much.
          prefs.edit().putString(KEY_PENDING, pending.toString()).commit()
          false
        }
      }
    }
  }

  /** Live heart rate and calories. Only worth anything to a listener there now. */
  fun onMetrics(json: String) {
    val metrics = try {
      JSONObject(json)
    } catch (e: Exception) {
      return
    }
    val emitter = synchronized(lock) { if (jsListening) emit else null } ?: return
    val body = mapOf("bpm" to metrics.optInt("hr", 0), "cal" to metrics.optInt("cal", 0))
    main.post { emitter("onWatchMetrics", body) }
  }
}
