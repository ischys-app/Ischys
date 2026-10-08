package app.ischys.liveactivity

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Thin bridge over [WorkoutNotification], with the same JS surface as the iOS
 * Live Activity module so the workout screen drives both through one API.
 */
class LiveActivityModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LiveActivity")
    Events("onActions")

    // A notification button is handled by the receiver, which queues the action
    // and calls this. We only signal JS; JS then drains the queue itself, so an
    // action is applied exactly once whether it arrives live or on resume.
    OnCreate {
      WorkoutNotification.onAction = { sendEvent("onActions", emptyMap<String, Any>()) }
    }

    OnDestroy {
      WorkoutNotification.onAction = null
    }

    Function("consumeActions") {
      WorkoutNotification.drainActions(context)
    }

    Function("setThemeId") { id: String ->
      WorkoutNotification.setThemeId(context, id)
    }

    /** Usable right now: notifications are allowed for Ischys and this channel. */
    Function("isSupported") {
      WorkoutNotification.canPost(context)
    }

    /** Every Android this app runs on can show an ongoing notification. */
    Function("isAvailable") {
      true
    }

    /** False once the user has swiped the notification away. */
    Function("isActive") {
      WorkoutNotification.isShowing(context)
    }

    // The state crosses as a JSON string, not a Map: the card's optional fields
    // arrive from JS as `undefined`, which the Map converter rejects outright.
    Function("start") { workoutStartedAt: Double, stateJson: String ->
      if (WorkoutNotification.start(context, workoutStartedAt.toLong(), JSONObject(stateJson))) "workout" else null
    }

    AsyncFunction("update") { stateJson: String ->
      WorkoutNotification.update(context, JSONObject(stateJson))
    }

    AsyncFunction("end") {
      WorkoutNotification.end(context)
    }
  }
}
