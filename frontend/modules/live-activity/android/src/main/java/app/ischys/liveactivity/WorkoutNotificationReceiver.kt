package app.ischys.liveactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives the workout notification's buttons, its dismissal, and the alarm at
 * the end of a rest. Declared in the manifest, so Android delivers these even
 * when the app's process has to be started to take them.
 */
class WorkoutNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      WorkoutNotification.ACTION_SKIP_REST -> WorkoutNotification.skipRest(context)
      WorkoutNotification.ACTION_ADJUST_REST ->
        WorkoutNotification.adjustRest(context, intent.getIntExtra(WorkoutNotification.EXTRA_SECONDS, 0))
      WorkoutNotification.ACTION_COMPLETE_SET ->
        intent.getStringExtra(WorkoutNotification.EXTRA_SET_ID)?.let {
          WorkoutNotification.completeSet(context, it)
        }
      WorkoutNotification.ACTION_REST_OVER -> WorkoutNotification.render(context)
      WorkoutNotification.ACTION_DISMISSED -> WorkoutNotification.dismissed(context)
    }
  }
}
