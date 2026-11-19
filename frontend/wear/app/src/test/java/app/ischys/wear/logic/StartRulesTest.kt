package app.ischys.wear.logic

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StartRulesTest {
  private fun rules(reachable: Boolean = true, handingOff: Boolean = false) = StartRules(reachable, handingOff)

  @Test fun aRoutineStartsWhenThePhoneIsInReachAndIdle() {
    assertTrue(rules().canStartRoutine)
    assertFalse(rules().routineDimmed(pending = false))
  }

  @Test fun aDimmedRoutineCannotBeTappedWhenThePhoneIsOutOfReach() {
    val r = rules(reachable = false)
    assertTrue(r.routineDimmed(pending = false))
    assertFalse(r.canStartRoutine)
  }

  @Test fun anEmptyWorkoutNeedsThePhoneInReachToo() {
    // Sets are logged through the phone, and a start queued out of reach is
    // dropped if Ischys is not running when it syncs: an offline start could
    // only ever record a session the phone may never see.
    val r = rules(reachable = false)
    assertFalse(r.canStartEmpty)
    assertTrue(r.emptyDimmed)
    assertTrue(rules().canStartEmpty)
    assertFalse(rules().emptyDimmed)
  }

  @Test fun aHandOffDimsEveryOtherRowAndBlocksSecondStarts() {
    val r = rules(handingOff = true)
    assertFalse(r.canStartRoutine)
    assertFalse(r.canStartEmpty)
    assertTrue(r.emptyDimmed)
    assertFalse(r.routineDimmed(pending = true))
    assertTrue(r.routineDimmed(pending = false))
  }
}
