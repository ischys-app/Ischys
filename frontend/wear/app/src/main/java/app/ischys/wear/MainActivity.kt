package app.ischys.wear

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import app.ischys.wear.link.PhoneLink
import app.ischys.wear.session.ExerciseService
import app.ischys.wear.ui.IschysApp

class MainActivity : ComponentActivity() {
  private val askPermissions =
    registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
      startPendingSession()
    }
  private var asked = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    notePhoneStart(intent)
    setContent { IschysApp() }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    notePhoneStart(intent)
  }

  override fun onResume() {
    super.onResume()
    PhoneLink.refresh()
    // Asked every time the app is first on screen, not only on a first run:
    // the phone can start a workout with this app in the background, where no
    // permission prompt can be shown, and heart rate would silently read 0
    // until the user dug into Settings. The system ignores the repeat once
    // answered.
    val missing = ExerciseService.permissions.filterNot { ExerciseService.granted(this, it) }
    if (missing.isNotEmpty() && !asked) {
      asked = true
      askPermissions.launch(missing.toTypedArray())
    } else {
      startPendingSession()
    }
  }

  /** Opened from the "workout started on phone" notification. */
  private fun notePhoneStart(intent: Intent?) {
    if (intent?.getBooleanExtra(ExerciseService.EXTRA_START_SESSION, false) == true) {
      WorkoutModel.pendingPhoneStart = true
    }
  }

  /** The session the phone asked for and the background could not start. */
  private fun startPendingSession() {
    if (!WorkoutModel.pendingPhoneStart) return
    if (ExerciseService.start(this)) WorkoutModel.pendingPhoneStart = false
  }
}
