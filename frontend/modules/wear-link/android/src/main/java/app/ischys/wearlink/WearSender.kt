package app.ischys.wearlink

import android.content.Context
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
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

  /**
   * Whether any Watch with Ischys is paired with this phone, in reach or not.
   * null until Google Play services has answered. With none there is nobody
   * to leave a state or a stop for, and writing one on every push — once a
   * second through a rest — is work for nothing.
   */
  @Volatile
  private var anyWatch: Boolean? = null

  /**
   * The state last pushed, for a Watch that comes back into reach: whatever
   * was sent while it was away it did not get.
   */
  @Volatile
  private var lastState: ByteArray? = null
  private var appContext: Context? = null

  private val capabilityListener = CapabilityClient.OnCapabilityChangedListener { info ->
    val before = nodes ?: emptySet()
    val now = nearby(info)
    nodes = now
    if (info.nodes.isNotEmpty()) anyWatch = true
    WearLog.d { "watch capability: ${info.nodes.map { "${it.id}${if (it.isNearby) "" else " (relayed)"}" }}" }
    val state = lastState
    val app = appContext
    if (state != null && app != null) {
      for (node in returned(before, now)) {
        WearLog.d { "OUT ${WearPaths.STATE} again, to $node back in reach" }
        Wearable.getMessageClient(app).sendMessage(node, WearPaths.STATE, state)
      }
    }
  }

  /**
   * Only Watches connected directly. One the Data Layer can still route to
   * through Google's servers — left at home on Wi-Fi, or out on mobile data —
   * also counts as reachable, but a message sent that way is not delivered
   * now and can be lost without a word. For those the state goes into a data
   * item, which the Data Layer does sync, whichever way it can.
   */
  private fun nearby(info: CapabilityInfo): Set<String> =
    info.nodes.filter { it.isNearby }.map { it.id }.toSet()

  /** The Watches in reach now that were not a moment ago. */
  internal fun returned(before: Set<String>, now: Set<String>): Set<String> = now - before

  /** Keeps `nodes` current while the app runs, so a push is not a lookup each. */
  @Synchronized
  fun start(context: Context) {
    if (listening) return
    listening = true
    appContext = context.applicationContext
    val capabilities = Wearable.getCapabilityClient(context.applicationContext)
    capabilities.addListener(capabilityListener, WearPaths.CAPABILITY_WATCH)
    capabilities.getCapability(WearPaths.CAPABILITY_WATCH, CapabilityClient.FILTER_ALL)
      .addOnSuccessListener { info ->
        // Never back to false here: the listener may already have seen one.
        if (info.nodes.isNotEmpty()) anyWatch = true else if (anyWatch == null) anyWatch = false
        WearLog.d { "a Watch with Ischys is paired: $anyWatch" }
      }
      // No Google Play services, or no Wear OS app on the phone: no Watch.
      .addOnFailureListener { if (anyWatch == null) anyWatch = false }
  }

  @Synchronized
  fun stop(context: Context) {
    if (!listening) return
    listening = false
    nodes = null
    anyWatch = null
    lastState = null
    appContext = null
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
        val found = nearby(info)
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
    // Not a finish verdict: that answers one request, once.
    if (!json.contains("\"finishVerdict\"")) lastState = payload
    withNodes(app) { reachable ->
      WearLog.d { "OUT ${WearPaths.STATE} to ${reachable.size} node(s) ${WearLog.brief(json)}" }
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
      WearLog.d { "OUT ${WearPaths.COMMAND} $cmd to ${reachable.size} node(s)" }
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

  /**
   * Tells the Watch that nothing here can act on what it sent: the app is not
   * running. A finish it is waiting on is named by its `finishId`; anything
   * else by its `action`.
   */
  fun undeliverable(context: Context, node: String, finishId: String, action: String) {
    WearLog.d { "OUT ${WearPaths.UNDELIVERABLE} $action $finishId" }
    val payload = undeliverablePayload(finishId, action).toByteArray()
    Wearable.getMessageClient(context.applicationContext)
      .sendMessage(node, WearPaths.UNDELIVERABLE, payload)
  }

  /**
   * Whether to leave something for a Watch that is out of reach. Not when it
   * is known that none is paired; while that is still unknown, yes — a stop
   * that is never delivered leaves a Watch recording.
   */
  internal fun worthQueueing(anyWatch: Boolean?): Boolean = anyWatch != false

  /** `{finishId}` for a finish being waited on, `{action}` for anything else. */
  internal fun undeliverablePayload(finishId: String, action: String): String =
    if (finishId.isNotEmpty()) {
      JSONObject().put("finishId", finishId).toString()
    } else {
      JSONObject().put("action", action).toString()
    }

  /** Leaves `payload` in the Data Layer for a Watch that is out of reach — if there is one. */
  private fun put(context: Context, path: String, payload: ByteArray) {
    if (!worthQueueing(anyWatch)) return
    WearLog.d { "PUT $path" }
    Wearable.getDataClient(context)
      .putDataItem(PutDataRequest.create(path).setData(payload).setUrgent())
  }
}
