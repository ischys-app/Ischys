package app.ischys.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Whether Android lets this app set exact alarms, and the settings page where
 * the user allows it.
 *
 * expo-notifications already schedules exactly when it may and falls back to an
 * inexact alarm when it may not; it just offers no way to ask which, or to send
 * the user to the switch.
 */
class ExactAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ExactAlarm")

    Function("canSchedule") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@Function true
      }
      val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarms.canScheduleExactAlarms()
    }

    Function("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@Function false
      }
      val intent = Intent(
        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
        Uri.parse("package:${context.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      true
    }
  }
}
