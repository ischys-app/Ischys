package app.ischys.wearlink

import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone's end of the link to the Wear OS companion, over the Wearable
 * Data Layer. The Android counterpart of the Watch half of the iOS Health
 * module: the same state goes out and the same actions come back, as JSON, so
 * the JS above (modules/health/index.ts) does not care which watch it is.
 */
class WearLinkModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WearLink")

    // onWatchAction: `{json}`, one WatchAction as the Watch sent it.
    // onWatchMetrics: `{bpm, cal}` streamed from the Watch's session.
    Events("onWatchAction", "onWatchMetrics")

    OnCreate {
      WearLinkHub.attach { event, body -> sendEvent(event, body) }
      appContext.reactContext?.let { WearSender.start(it) }
    }

    OnDestroy {
      WearLinkHub.detach()
      appContext.reactContext?.let { WearSender.stop(it) }
    }

    /** Whether the Data Layer exists here at all: it is part of Google Play services. */
    Function("isAvailable") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) ==
        ConnectionResult.SUCCESS
    }

    /**
     * Starts the Watch's session, so it measures without the user opening
     * anything. Silently does nothing with no Watch in reach.
     */
    Function("startWorkout") {
      WearSender.command(context, "start", queueIfUnreachable = false)
    }

    /** Ends the Watch's session; `discard` drops what it measured. */
    Function("stopWorkout") { discard: Boolean ->
      WearSender.command(context, if (discard) "discard" else "stop", queueIfUnreachable = true)
    }

    /** Pushes the workout state, as the JSON text of a `WatchState`. */
    Function("updateState") { json: String ->
      WearSender.pushState(context, json)
    }

    /**
     * Drains the Watch actions that arrived with no JS to hear them, and marks
     * JS as listening from here on. Each is the JSON text of one action.
     *
     * The window is wider than on iOS. There, a message from the Watch wakes
     * the app and its JS; here it wakes only the native listener, so a Finish
     * tapped on the wrist with the app closed waits, on disk, until the app is
     * next opened.
     */
    AsyncFunction("consumeActions") {
      WearLinkHub.drain(context)
    }
  }
}
