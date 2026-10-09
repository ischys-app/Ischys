package app.ischys.wearlink

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * Receives what the Wear OS companion sends: an action as a message while the
 * phone is in reach, or as a data item it queued while it was not; and the
 * live metrics as messages (as a data item too from an older Watch build).
 * Everything goes to `WearLinkHub`, which knows whether JS is there to hear it.
 */
class WearLinkListenerService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    val json = String(event.data, Charsets.UTF_8)
    WearLog.d { "IN ${event.path} ${WearLog.brief(json)}" }
    when (event.path) {
      WearPaths.ACTION -> {
        val refused = WearLinkHub.onAction(this, json)
        if (refused) {
          val action = JSONObject(json)
          WearSender.undeliverable(
            this,
            event.sourceNodeId,
            finishId = action.optString("finishId", ""),
            action = action.optString("action", ""),
          )
        }
      }
      WearPaths.METRICS -> WearLinkHub.onMetrics(json)
    }
  }

  override fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val item = event.dataItem
      val path = item.uri.path ?: continue
      val json = item.data?.let { String(it, Charsets.UTF_8) } ?: continue
      WearLog.d { "IN data $path ${WearLog.brief(json)}" }
      if (path.startsWith(WearPaths.QUEUED)) {
        WearLinkHub.onQueued(this, item.uri, json)
      } else if (path == WearPaths.METRICS) {
        WearLinkHub.onMetrics(json)
      }
    }
  }
}
