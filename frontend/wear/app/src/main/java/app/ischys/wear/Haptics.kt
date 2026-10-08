package app.ischys.wear

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator

/** The two things the wrist says without being looked at. */
object Haptics {
  /** The end of a rest: long enough to feel through a set of straps. */
  fun restOver(context: Context) = play(context, longArrayOf(0, 220, 130, 220, 130, 320))

  /** The phone could not finish the workout. */
  fun failure(context: Context) = play(context, longArrayOf(0, 90, 80, 90, 80, 90))

  private fun play(context: Context, pattern: LongArray) {
    val vibrator = context.getSystemService(Vibrator::class.java) ?: return
    val effect = VibrationEffect.createWaveform(pattern, -1)
    // As an alarm: the rest ends with the screen off and the app in the
    // background, where an ordinary vibration is dropped.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(
        effect,
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),
      )
    }
  }
}
