package app.ischys.wear

import android.view.HapticFeedbackConstants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HapticsTest {
  /** The stretches the motor is on for: every second entry, after the lead-in. */
  private fun pulses(w: HapticPatterns.Waveform) = w.timings.filterIndexed { i, _ -> i % 2 == 1 }

  private fun wellFormed(w: HapticPatterns.Waveform) {
    assertEquals(w.timings.size, w.amplitudes.size)
    // Starts at once: a rest that has ended is already late.
    assertEquals(0L, w.timings[0])
    w.amplitudes.forEachIndexed { i, a ->
      if (i % 2 == 0) assertEquals(0, a) else assertTrue(a == -1 || a in 1..255)
    }
    assertTrue(w.timings.drop(1).all { it > 0 })
  }

  @Test fun bothWaveformsAreWellFormed() {
    wellFormed(HapticPatterns.restOver)
    wellFormed(HapticPatterns.failure)
  }

  @Test fun theEndOfARestIsTwoFirmPulsesAtFullStrength() {
    val on = pulses(HapticPatterns.restOver)
    assertEquals(2, on.size)
    assertTrue(on.all { it >= 200 })
    assertTrue(HapticPatterns.restOver.amplitudes.filterIndexed { i, _ -> i % 2 == 1 }.all { it == 255 })
  }

  @Test fun aFailureIsThreeShortPulsesAndCannotBeMistakenForARest() {
    val on = pulses(HapticPatterns.failure)
    assertEquals(3, on.size)
    assertTrue(on.max() < pulses(HapticPatterns.restOver).min())
  }

  @Test fun theCrownTickIsTheSegmentTickWhereAndroidHasIt() {
    assertEquals(HapticFeedbackConstants.CONTEXT_CLICK, HapticPatterns.crownNotch(30))
    assertEquals(HapticFeedbackConstants.CONTEXT_CLICK, HapticPatterns.crownNotch(33))
    assertEquals(HapticFeedbackConstants.SEGMENT_TICK, HapticPatterns.crownNotch(34))
    assertEquals(HapticFeedbackConstants.SEGMENT_TICK, HapticPatterns.crownNotch(36))
  }
}
