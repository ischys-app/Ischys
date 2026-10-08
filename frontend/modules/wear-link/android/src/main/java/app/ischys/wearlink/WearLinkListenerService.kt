package app.ischys.wearlink

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * Receives what the Wear OS companion sends: an action as a message while the
 * phone is in reach, or as a data item it queued while it was not; and the
 * live metrics the same two ways. Everything goes to `WearLinkHub`, which
 * knows whether JS is there to hear it.
 */
class WearLinkListenerService : WearableListenerService() {
  override fun onMessageReceived(event: MessageEvent) {
    val json = String(event.data, Charsets.UTF_8)
    when (event.path) {
      WearPaths.ACTION -> {
        val refused = WearLinkHub.onAction(this, json)
        if (refused) {
          val finishId = JSONObject(json).optString("finishId", "")
          WearSender.undeliverable(this, event.sourceNodeId, finishId)
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
      if (path.startsWith(WearPaths.QUEUED)) {
        // A queued finish never carries an id, so there is nothing to refuse.
        WearLinkHub.onAction(this, json)
        // Handled once. Left in place it would be handed over again whenever
        // the Data Layer next syncs.
        Wearable.getDataClient(this).deleteDataItems(item.uri)
      } else if (path == WearPaths.METRICS) {
        WearLinkHub.onMetrics(json)
      }
    }
  }
}
