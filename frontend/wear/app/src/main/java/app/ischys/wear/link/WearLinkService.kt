package app.ischys.wear.link

import android.os.Handler
import android.os.Looper
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.Wire
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

/**
 * Receives what the phone sends. Google Play services binds this whenever
 * something arrives on one of the manifest's paths, starting the process if it
 * has to — so a state push, or the phone starting or ending a workout, lands
 * with the Watch app closed.
 *
 * Everything is handed to `WorkoutModel` on the main thread; the callbacks
 * here run on a background one.
 */
class WearLinkService : WearableListenerService() {
  private val main = Handler(Looper.getMainLooper())

  override fun onMessageReceived(event: MessageEvent) {
    deliver(event.path, event.data)
  }

  override fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      val item = event.dataItem
      val path = item.uri.path ?: continue
      // Copied out now: the buffer is released when this returns.
      val data = item.data?.copyOf() ?: continue
      deliver(path, data)
      // A queued command is acted on once. Left in place it would be handed
      // over again whenever the Data Layer next syncs.
      if (path == Wire.PATH_COMMAND) Wearable.getDataClient(this).deleteDataItems(item.uri)
    }
  }

  private fun deliver(path: String, data: ByteArray) {
    main.post { WorkoutModel.onInbound(path, data) }
  }
}
