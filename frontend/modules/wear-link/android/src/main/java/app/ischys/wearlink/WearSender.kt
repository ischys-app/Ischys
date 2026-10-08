package app.ischys.wearlink

import android.content.Context
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

/**
 * Phone → Watch. A message when a Watch with Ischys is in reach, which wakes
 * its listener and is delivered now. Out of reach, the things that still
 * matter later — the newest state, a stop — go into a data item instead,
 * which the Data Layer syncs when the Watch is back.
 */
internal object WearSender {
  /** Reachable Watch nodes with Ischys installed. null until first asked. */
  @Volatile
  private var nodes: Set<String>? = null
  private var listening = false

  private val capabilityListener = CapabilityClient.OnCapabilityChangedListener { info ->
    nodes = info.nodes.map { it.id }.toSet()
  }

  /** Keeps `nodes` current while the app runs, so a push is not a lookup each. */
  @Synchronized
  fun start(context: Context) {
    if (listening) return
    listening = true
    Wearable.getCapabilityClient(context.applicationContext)
      .addListener(capabilityListener, WearPaths.CAPABILITY_WATCH)
  }

  @Synchronized
  fun stop(context: Context) {
    if (!listening) return
    listening = false
    nodes = null
    Wearable.getCapabilityClient(context.applicationContext).removeListener(capabilityListener)
  }

  private fun withNodes(context: Context, then: (Set<String>) -> Unit) {
    val known = nodes
    if (known != null) {
      then(known)
      return
    }
    Wearable.getCapabilityClient(context)
      .getCapability(WearPaths.CAPABILITY_WATCH, CapabilityClient.FILTER_REACHABLE)
      .addOnSuccessListener { info ->
        val found = info.nodes.map { it.id }.toSet()
        nodes = found
        then(found)
      }
      // No Google Play services, or no Wear OS app on the phone: no Watch.
      .addOnFailureListener { then(emptySet()) }
  }

  /**
   * The latest workout state. Stamped with the time it was sent: a data item
   * written while the Watch was away can sync after newer messages have
   * already arrived, and the Watch uses the stamp to ignore it.
   */
  fun pushState(context: Context, json: String) {
    val app = context.applicationContext
    val payload = try {
      JSONObject(json).put("sentAt", System.currentTimeMillis()).toString().toByteArray()
    } catch (e: Exception) {
      return
    }
    withNodes(app) { reachable ->
      if (reachable.isEmpty()) {
        put(app, WearPaths.STATE, payload)
        return@withNodes
      }
      val messages = Wearable.getMessageClient(app)
      for (node in reachable) {
        messages.sendMessage(node, WearPaths.STATE, payload)
          .addOnFailureListener { put(app, WearPaths.STATE, payload) }
      }
    }
  }

  /**
   * `start` launches the Watch's session; `stop` and `discard` end it. A start
   * that cannot be delivered now is dropped — the workout may be over by the
   * time it could be. A stop is queued: ending on the phone must still end
   * the Watch's session when it comes back into reach.
   */
  fun command(context: Context, cmd: String, queueIfUnreachable: Boolean) {
    val app = context.applicationContext
    val payload = JSONObject()
      .put("cmd", cmd)
      .put("sentAt", System.currentTimeMillis())
      .toString()
      .toByteArray()
    withNodes(app) { reachable ->
      if (reachable.isEmpty()) {
        if (queueIfUnreachable) put(app, WearPaths.COMMAND, payload)
        return@withNodes
      }
      val messages = Wearable.getMessageClient(app)
      for (node in reachable) {
        messages.sendMessage(node, WearPaths.COMMAND, payload)
          .addOnFailureListener { if (queueIfUnreachable) put(app, WearPaths.COMMAND, payload) }
      }
    }
  }

  /** Tells the Watch that asked that nothing here can answer its finish. */
  fun undeliverable(context: Context, node: String, finishId: String) {
    val payload = JSONObject().put("finishId", finishId).toString().toByteArray()
    Wearable.getMessageClient(context.applicationContext)
      .sendMessage(node, WearPaths.UNDELIVERABLE, payload)
  }

  private fun put(context: Context, path: String, payload: ByteArray) {
    Wearable.getDataClient(context)
      .putDataItem(PutDataRequest.create(path).setData(payload).setUrgent())
  }
}
