package app.ischys.wear.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Base64
import app.ischys.wear.WorkoutModel
import app.ischys.wear.link.PhoneLink

/**
 * Debug builds only: the phone's side of the link, driven from adb, for an
 * emulator with no phone to pair with. Payloads go through the same entry
 * point as ones from the Data Layer (`WorkoutModel.onInbound`).
 *
 *     adb shell am broadcast -n app.ischys.mobile/app.ischys.wear.debug.DebugReceiver \
 *       --es path /ischys/state --es b64 "$(base64 < state.json)"
 *     adb shell am broadcast -n app.ischys.mobile/app.ischys.wear.debug.DebugReceiver \
 *       --es reachable true      # true | false | unset
 *
 * With `reachable true` the Watch behaves as if the phone were in reach, and
 * what it would send is written to logcat under the tag IschysLink.
 */
class DebugReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    intent.getStringExtra("reachable")?.let {
      PhoneLink.debugReachable = it.toBooleanStrictOrNull()
    }
    val path = intent.getStringExtra("path") ?: return
    val payload = intent.getStringExtra("b64")?.let { Base64.decode(it, Base64.DEFAULT) }
      ?: intent.getStringExtra("json")?.toByteArray(Charsets.UTF_8)
      ?: return
    WorkoutModel.onInbound(path, payload)
  }
}
