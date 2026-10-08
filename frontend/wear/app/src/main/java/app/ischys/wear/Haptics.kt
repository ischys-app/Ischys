package app.ischys.wear

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.HapticFeedbackConstants
import android.view.View

/**
 * What each haptic is made of. Nothing here touches the device, so it runs in
 * a JVM test (HapticsTest).
 *
 * The Apple Watch is the reference, and plays three:
 *
 *   moment                        Apple Watch             here
 *   a rest ran out                .notification           [restOver], as an alarm
 *   the phone could not finish    .failure                [failure], as an alarm
 *   one notch of the crown        the crown's own detent  [crownNotch], as touch feedback
 *
 * Android has no named effect for the first two that a watch is sure to carry,
 * so they are waveforms shaped after the role: a notification is two firm
 * pulses, a failure three short ones.
 */
object HapticPatterns {
  /** Milliseconds, off then on alternately, with the strength of each stretch. */
  class Waveform(val timings: LongArray, val amplitudes: IntArray)

  private const val FULL = 255
  private const val DEFAULT = VibrationEffect.DEFAULT_AMPLITUDE

  /**
   * The end of a rest. Two pulses, the shape of a notification on either
   * wrist, but longer and at full strength: it has to be felt mid-workout,
   * through a set of straps, on a motor weaker than a Taptic Engine.
   */
  val restOver = Waveform(longArrayOf(0, 200, 120, 300), intArrayOf(0, FULL, 0, FULL))

  /** The phone could not finish the workout. */
  val failure = Waveform(
    longArrayOf(0, 90, 80, 90, 80, 90),
    intArrayOf(0, DEFAULT, 0, DEFAULT, 0, DEFAULT),
  )

  /**
   * The system effect for one notch of the crown. Android 14 named the tick
   * for stepping through values; before it the context click is the same
   * light tick. (The rotary constants themselves are not public.)
   */
  fun crownNotch(sdk: Int): Int =
    if (sdk >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      HapticFeedbackConstants.SEGMENT_TICK
    } else {
      HapticFeedbackConstants.CONTEXT_CLICK
    }
}

/** The things the wrist says without being looked at. */
object Haptics {
  /** The end of a rest. */
  fun restOver(context: Context) = play(context, HapticPatterns.restOver)

  /** The phone could not finish the workout. */
  fun failure(context: Context) = play(context, HapticPatterns.failure)

  /**
   * The crown moved a value one notch. The Apple Watch's crown clicks by
   * itself; a Wear OS crown only does for a list the system scrolls. Played
   * through the view, so it follows the watch's touch-feedback setting.
   */
  fun crownNotch(view: View) {
    view.performHapticFeedback(HapticPatterns.crownNotch(Build.VERSION.SDK_INT))
  }

  private fun play(context: Context, waveform: HapticPatterns.Waveform) {
    val vibrator = context.getSystemService(Vibrator::class.java) ?: return
    val effect = VibrationEffect.createWaveform(waveform.timings, waveform.amplitudes, -1)
    // As an alarm: the rest ends with the screen off and the app in the
    // background, where an ordinary vibration is dropped — and the wait for the
    // phone to finish can outlast the screen too.
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
