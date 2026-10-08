package app.ischys.wear.link

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import app.ischys.wear.BuildConfig
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.Wire
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import java.util.UUID
import org.json.JSONObject

/**
 * The Watch's end of the phone link: sends the user's actions and the live
 * metrics over the Wearable Data Layer, and knows whether the phone is in
 * reach. What arrives from the phone comes in through `WearLinkService`.
 *
 * In reach means a connected node advertising the phone app's capability. An
 * action is then a message, delivered now. Out of reach it becomes a data item,
 * which the Data Layer holds and syncs when the phone is back — the queue the
 * Apple Watch gets from `transferUserInfo`.
 */
object PhoneLink {
  private const val TAG = "IschysLink"

  private lateinit var app: Context
  private val main = Handler(Looper.getMainLooper())

  /** The phone node to message, or null when none is in reach. */
  @Volatile
  private var phoneNode: String? = null

  /**
   * Debug builds only (DebugReceiver): stands in for a paired phone on the
   * emulator, where there is none. Sends are then logged instead of delivered.
   */
  @Volatile
  var debugReachable: Boolean? = null
    set(value) {
      field = value
      main.post { WorkoutModel.onPhoneReachable(canAskNow) }
    }

  /** Whether something sent now would reach the phone now, so an answer can be waited for. */
  val canAskNow: Boolean get() = debugReachable ?: (phoneNode != null)

  private val capabilityListener = CapabilityClient.OnCapabilityChangedListener { info ->
    onCapability(info)
  }

  fun init(context: Context) {
    if (::app.isInitialized) return
    app = context.applicationContext
    Wearable.getCapabilityClient(app).addListener(capabilityListener, Wire.CAPABILITY_PHONE)
    refresh()
  }

  /** Asks again who is in reach. Called when the app comes on screen. */
  fun refresh() {
    Wearable.getCapabilityClient(app)
      .getCapability(Wire.CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE)
      .addOnSuccessListener { onCapability(it) }
      .addOnFailureListener { setNode(null) }
  }

  private fun onCapability(info: CapabilityInfo) {
    // A nearby node (Bluetooth) over one reached through the cloud.
    val node = info.nodes.firstOrNull { it.isNearby } ?: info.nodes.firstOrNull()
    setNode(node?.id)
  }

  private fun setNode(id: String?) {
    phoneNode = id
    main.post { WorkoutModel.onPhoneReachable(canAskNow) }
  }

  /**
   * One action. Sent now when the phone is in reach; otherwise, and when
   * sending fails, queued unless `queueIfUnreachable` is false.
   */
  fun send(action: JSONObject, queueIfUnreachable: Boolean = true) {
    log(Wire.PATH_ACTION, action)
    if (debugReachable == true) return
    val node = phoneNode
    if (node == null) {
      if (queueIfUnreachable) put(queuedPath(), action)
      return
    }
    Wearable.getMessageClient(app)
      .sendMessage(node, Wire.PATH_ACTION, bytes(action))
      .addOnFailureListener { if (queueIfUnreachable) put(queuedPath(), action) }
  }

  /** One action, queued for whenever the phone is next in reach. */
  fun queue(action: JSONObject) {
    log(Wire.PATH_QUEUED, action)
    put(queuedPath(), action)
  }

  /**
   * Finish, from a Watch that keeps recording until the phone answers. Never
   * queued: a queued request is answered whenever the phone next runs, far too
   * late to wait for. If it cannot be sent the model is told instead.
   */
  fun requestFinish(id: String) {
    val request = Wire.endAsking(id)
    log(Wire.PATH_ACTION, request)
    if (debugReachable == true) return
    val node = phoneNode
    if (node == null) {
      main.post { WorkoutModel.finishUndeliverable(id) }
      return
    }
    Wearable.getMessageClient(app)
      .sendMessage(node, Wire.PATH_ACTION, bytes(request))
      .addOnFailureListener { main.post { WorkoutModel.finishUndeliverable(id) } }
  }

  /**
   * Live sensor metrics. A message while the phone is in reach; otherwise one
   * data item that each reading overwrites, so the newest lands when it is back.
   */
  fun sendMetrics(hr: Int, cal: Int) {
    val metrics = Wire.metrics(hr, cal)
    if (debugReachable == true) {
      log(Wire.PATH_METRICS, metrics)
      return
    }
    val node = phoneNode
    if (node == null) {
      put(Wire.PATH_METRICS, metrics)
      return
    }
    Wearable.getMessageClient(app).sendMessage(node, Wire.PATH_METRICS, bytes(metrics))
  }

  private fun queuedPath() = "${Wire.PATH_QUEUED}/${UUID.randomUUID()}"

  private fun put(path: String, payload: JSONObject) {
    val request = PutDataRequest.create(path).setData(bytes(payload)).setUrgent()
    Wearable.getDataClient(app).putDataItem(request)
      .addOnSuccessListener { if (BuildConfig.DEBUG) Log.d(TAG, "QUEUED ${it.uri.path}") }
      .addOnFailureListener { Log.w(TAG, "could not queue $path", it) }
  }

  private fun bytes(json: JSONObject) = json.toString().toByteArray(Charsets.UTF_8)

  private fun log(path: String, payload: JSONObject) {
    if (BuildConfig.DEBUG) Log.d(TAG, "OUT $path $payload")
  }
}
