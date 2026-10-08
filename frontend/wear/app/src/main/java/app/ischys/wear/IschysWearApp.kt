package app.ischys.wear

import android.app.Application
import app.ischys.wear.link.PhoneLink
import app.ischys.wear.session.ExerciseService

class IschysWearApp : Application() {
  override fun onCreate() {
    super.onCreate()
    // Here rather than in the activity: Google Play services can start this
    // process for the listener service alone, when the phone pushes a state or
    // starts a workout with the app closed.
    WorkoutModel.init(this)
    PhoneLink.init(this)
    // Clear a session orphaned by an earlier process before it holds the
    // heart-rate sensor on for nothing.
    ExerciseService.recoverOrphan(this)
  }
}
