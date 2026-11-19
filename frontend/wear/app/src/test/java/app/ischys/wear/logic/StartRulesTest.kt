package app.ischys.wear.logic

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StartRulesTest {
  private fun rules(reachable: Boolean = true, appClosed: Boolean = false, handingOff: Boolean = false) =
    StartRules(reachable, appClosed, handingOff)

  @Test fun aRoutineStartsWhenThePhoneIsReadyAndIdle() {
    assertTrue(rules().canStartRoutine)
  }

  @Test fun aDimmedRoutineCannotBeTappedWhenThePhoneIsOutOfReach() {
    val r = rules(reachable = false)
    assertTrue(r.routineDimmed(pending = false))
    assertFalse(r.canStartRoutine)
  }

  @Test fun nothingStartsWhileIschysIsClosedOnThePhone() {
    // The phone refuses a start it cannot apply and drops it, so the Watch
    // must not record a workout the phone will never see.
    val r = rules(appClosed = true)
    assertFalse(r.canStartRoutine)
    assertFalse(r.canStartEmpty)
    assertTrue(r.routineDimmed(pending = false))
    assertTrue(r.emptyDimmed)
  }

  @Test fun anEmptyWorkoutStillStartsOutOfReach() {
    val r = rules(reachable = false)
    assertTrue(r.canStartEmpty)
    assertFalse(r.emptyDimmed)
  }

  @Test fun aHandOffDimsEveryOtherRowAndBlocksSecondStarts() {
    val r = rules(handingOff = true)
    assertFalse(r.canStartRoutine)
    assertFalse(r.canStartEmpty)
    assertFalse(r.routineDimmed(pending = true))
    assertTrue(r.routineDimmed(pending = false))
  }
}
