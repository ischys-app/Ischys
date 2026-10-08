package app.ischys.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Watch's state machine, with everything Android behind a recording host. */
class WorkoutCoreTest {
  private class FakeHost : WorkoutCore.Host {
    override var sessionRunning = false
    override var phoneReachable = true
    val calls = mutableListOf<String>()
    var core: WorkoutCore? = null

    override fun onUiChanged(ui: UiState) {}
    override fun playRestHaptic() { calls += "restHaptic" }
    override fun playFailureHaptic() { calls += "failureHaptic" }
    override fun endSession(discard: Boolean) {
      calls += if (discard) "discardSession" else "endSession"
      // The session reports its end back, as ExerciseService does.
      sessionRunning = false
      core?.sessionEnded()
    }
    override fun sendEnd() { calls += "sendEnd" }
    override fun sendFinishRequest(id: String) { calls += "ask:$id" }
    override fun queueEnd() { calls += "queueEnd" }
    override fun requestState() { calls += "requestState" }
    override fun persistTheme(id: String) { calls += "theme:$id" }
  }

  private val t0 = 1_760_000_100_000L
  private val host = FakeHost()
  private val core = WorkoutCore(host).also { host.core = it }

  private fun session(
    setNum: Int = 2,
    weight: String = "100",
    reps: String = "8",
    unit: String? = "kg",
    resting: Boolean = false,
    restEndsAt: Long? = null,
    restRemaining: Int = 0,
    restAlerts: Boolean = true,
    setsDone: Int = 1,
    setsTotal: Int = 5,
  ) = PhoneState(
    screen = WatchScreen.SESSION,
    startedAt = t0 - 60_000,
    routineName = "Push Day",
    exerciseName = "Bench Press",
    setNum = setNum,
    setCount = 3,
    weight = weight,
    reps = reps,
    unit = unit,
    resting = resting,
    restEndsAt = restEndsAt,
    restRemaining = restRemaining,
    restTotal = 120,
    restAlerts = restAlerts,
    setsDone = setsDone,
    setsTotal = setsTotal,
  )

  private fun startSession(now: Long = t0) {
    host.sessionRunning = true
    core.sessionStarted(now, now)
  }

  // Mirroring

  @Test fun aSessionPushMovesToTheSessionAndSeedsTheSet() {
    core.apply(session(), t0)
    assertEquals(WatchScreen.SESSION, core.ui.screen)
    assertEquals("100", core.ui.weight)
    assertEquals("8", core.ui.reps)
    // The elapsed clock counts from the workout's start, at once.
    assertEquals(60, core.ui.elapsedSec)
  }

  @Test fun aSessionPushKeepsTheRoutinesAStartPushSent() {
    val routines = listOf(RoutineItem("r1", "Push Day", "PD", 5))
    core.apply(PhoneState(screen = WatchScreen.START, routines = routines), t0)
    core.apply(session(), t0)
    assertEquals(routines, core.ui.routines)
  }

  @Test fun thePhonesStartBeatsTheSessionsOwn() {
    startSession(t0)
    assertEquals(0, core.ui.elapsedSec)
    core.apply(session(), t0 + 1_000)
    assertEquals(61, core.ui.elapsedSec)
  }

  @Test fun aSessionStartingAfterThePushKeepsThePhonesOrigin() {
    core.apply(session(), t0)
    startSession(t0 + 5_000)
    assertEquals(65, core.ui.elapsedSec)
  }

  @Test fun aLocalEditSurvivesARepeatedPushOfTheSameSet() {
    core.apply(session(), t0)
    core.stepWeight(3, t0 + 1_000)
    assertEquals("101.5", core.ui.weight)
    // The phone pushes every second while resting or ticking; the value it
    // sends is still the one it had, and the wrist is mid-adjustment.
    core.apply(session(), t0 + 2_000)
    assertEquals("101.5", core.ui.weight)
  }

  @Test fun aPushedEditLandsOnceTheWristGoesQuiet() {
    core.apply(session(), t0)
    core.stepWeight(1, t0 + 1_000)
    core.apply(session(weight = "105"), t0 + 1_000 + WorkoutCore.EDIT_GRACE_MS)
    assertEquals("105", core.ui.weight)
  }

  @Test fun aNewSetReseedsEvenMidEdit() {
    core.apply(session(), t0)
    core.stepReps(2, t0 + 1_000)
    assertEquals("10", core.ui.reps)
    core.apply(session(setNum = 3, weight = "102.5", reps = "6"), t0 + 1_500)
    assertEquals("102.5", core.ui.weight)
    assertEquals("6", core.ui.reps)
  }

  @Test fun aUnitSwitchReplacesTheNumberOutright() {
    core.apply(session(), t0)
    core.stepWeight(1, t0 + 1_000)
    core.apply(session(weight = "220.46", unit = "lb"), t0 + 1_500)
    assertEquals("lb", core.ui.unit)
    assertEquals("220.46", core.ui.weight)
    // And the next notch is a pound step, on the pound grid.
    core.stepWeight(1, t0 + 2_000)
    assertEquals("222.5", core.ui.weight)
  }

  @Test fun aPushWithoutAUnitKeepsTheLastOne() {
    core.apply(session(unit = "lb"), t0)
    core.apply(PhoneState(screen = WatchScreen.START), t0 + 1_000)
    assertEquals("lb", core.ui.unit)
  }

  @Test fun allSetsDoneNeedsAPlan() {
    core.apply(session(setsDone = 0, setsTotal = 0), t0)
    assertFalse(core.ui.allSetsDone)
    core.apply(session(setsDone = 5, setsTotal = 5), t0)
    assertTrue(core.ui.allSetsDone)
  }

  @Test fun theThemeIsPersistedWhenItChanges() {
    core.apply(session().copy(themeId = "volt"), t0)
    core.apply(session().copy(themeId = "volt"), t0 + 1_000)
    assertEquals(listOf("theme:volt"), host.calls.filter { it.startsWith("theme") })
    assertEquals("volt", core.ui.themeId)
    // A push that does not carry one leaves it alone.
    core.apply(session(), t0 + 2_000)
    assertEquals("volt", core.ui.themeId)
  }

  @Test fun aStateOlderThanOneAlreadyAppliedIsIgnored() {
    core.apply(session(setNum = 3).copy(sentAt = t0 + 5_000), t0 + 5_000)
    // The data item from before, syncing late.
    core.apply(session(setNum = 2).copy(sentAt = t0), t0 + 6_000)
    assertEquals(3, core.ui.setNum)
    core.apply(session(setNum = 1).copy(sentAt = t0 + 7_000), t0 + 7_000)
    assertEquals(1, core.ui.setNum)
    // A push with no stamp is never held back.
    core.apply(session(setNum = 2), t0 + 8_000)
    assertEquals(2, core.ui.setNum)
  }

  @Test fun aPhoneClockSetFarBackIsNotShutOut() {
    core.apply(session(setNum = 3).copy(sentAt = t0), t0)
    core.apply(session(setNum = 2).copy(sentAt = t0 - WorkoutCore.STALE_WINDOW_MS), t0 + 1_000)
    assertEquals(2, core.ui.setNum)
  }

  // Rest

  @Test fun theCountdownIsDerivedFromTheEndDate() {
    val end = t0 + 90_000
    core.apply(session(resting = true, restEndsAt = end, restRemaining = 90), t0)
    assertTrue(core.ui.resting)
    assertEquals(90, core.ui.restRemaining)
    // No further pushes: a locked phone stops sending them.
    core.tick(t0 + 30_500)
    assertEquals(60, core.ui.restRemaining)
    core.tick(end - 9_000)
    assertTrue(core.ui.restFinal)
    assertTrue(core.needsTicking)
    assertEquals(end, core.restDeadline)
  }

  @Test fun theWristBuzzesOnceWhenTheRestRunsOut() {
    val end = t0 + 90_000
    core.apply(session(resting = true, restEndsAt = end, restRemaining = 90), t0)
    core.tick(end - 1)
    assertTrue(host.calls.none { it == "restHaptic" })
    core.tick(end)
    assertFalse(core.ui.resting)
    assertEquals(0, core.ui.restRemaining)
    core.tick(end + 1_000)
    core.apply(session(), end + 1_200)
    assertEquals(1, host.calls.count { it == "restHaptic" })
  }

  @Test fun aSkippedRestIsSilentAndClearsTheBanner() {
    val end = t0 + 90_000
    core.apply(session(resting = true, restEndsAt = end, restRemaining = 90), t0)
    core.apply(session(), t0 + 20_000)
    assertFalse(core.ui.resting)
    core.tick(end)
    assertTrue(host.calls.none { it == "restHaptic" })
  }

  @Test fun anAdjustedRestCountsToItsNewEnd() {
    val end = t0 + 90_000
    core.apply(session(resting = true, restEndsAt = end, restRemaining = 90), t0)
    core.apply(session(resting = true, restEndsAt = end + 15_000, restRemaining = 95), t0 + 10_000)
    assertEquals(95, core.ui.restRemaining)
    core.tick(end)
    assertTrue(core.ui.resting)
    assertTrue(host.calls.none { it == "restHaptic" })
    core.tick(end + 15_000)
    assertEquals(1, host.calls.count { it == "restHaptic" })
  }

  @Test fun alertsOffCountsDownWithoutBuzzing() {
    val end = t0 + 30_000
    core.apply(session(resting = true, restEndsAt = end, restRemaining = 30, restAlerts = false), t0)
    core.tick(end)
    assertFalse(core.ui.resting)
    assertTrue(host.calls.none { it == "restHaptic" })
  }

  @Test fun aRestWithoutAnEndDateShowsThePushedSeconds() {
    core.apply(session(resting = true, restEndsAt = null, restRemaining = 42), t0)
    assertTrue(core.ui.resting)
    assertEquals(42, core.ui.restRemaining)
    assertNull(core.restDeadline)
  }

  @Test fun endingTheSessionDropsThePendingBuzz() {
    startSession()
    val end = t0 + 90_000
    core.apply(session(resting = true, restEndsAt = end, restRemaining = 90), t0)
    core.phoneEnded(discard = false)
    core.tick(end)
    assertTrue(host.calls.none { it == "restHaptic" })
    assertFalse(core.needsTicking)
  }

  // Session lifecycle

  @Test fun aSessionStartingEntersTheWorkoutAndAsksForState() {
    startSession()
    assertEquals(WatchScreen.SESSION, core.ui.screen)
    assertEquals(listOf("requestState"), host.calls)
  }

  @Test fun thePhoneStoppingEndsTheSessionAndLeaves() {
    startSession()
    core.apply(session(), t0)
    core.phoneEnded(discard = false)
    assertEquals("endSession", host.calls.last())
    assertEquals(WatchScreen.START, core.ui.screen)
  }

  @Test fun thePhoneDiscardingDropsTheSession() {
    startSession()
    core.phoneEnded(discard = true)
    assertEquals("discardSession", host.calls.last())
  }

  @Test fun thePhoneStoppingWithNoSessionStillLeavesTheWorkout() {
    core.apply(session(), t0)
    core.phoneEnded(discard = false)
    assertEquals(WatchScreen.START, core.ui.screen)
    assertTrue(host.calls.none { it == "endSession" })
  }

  @Test fun aRoutineTapHoldsUntilThePhoneMovesOffStart() {
    core.routineTapped("r1")
    assertEquals("r1", core.ui.pendingRoutineId)
    core.apply(PhoneState(screen = WatchScreen.START), t0)
    assertEquals("r1", core.ui.pendingRoutineId)
    core.apply(session(), t0 + 1_000)
    assertNull(core.ui.pendingRoutineId)
  }

  // Finishing

  @Test fun finishAsksThePhoneAndKeepsRecording() {
    startSession()
    core.requestFinish("f1", t0)
    assertTrue(core.ui.finishing)
    assertEquals("ask:f1", host.calls.last())
    assertTrue(host.sessionRunning)
    assertEquals(WatchScreen.SESSION, core.ui.screen)
  }

  @Test fun aFinishedVerdictEndsTheSession() {
    startSession()
    core.requestFinish("f1", t0)
    core.finishVerdict(FinishHandshake.Verdict.FINISHED, "f1")
    assertFalse(core.ui.finishing)
    assertEquals("endSession", host.calls.last())
    assertEquals(WatchScreen.START, core.ui.screen)
  }

  @Test fun aFailedVerdictKeepsRecordingAndSaysSo() {
    startSession()
    core.requestFinish("f1", t0)
    core.finishVerdict(FinishHandshake.Verdict.FAILED, "f1")
    assertFalse(core.ui.finishing)
    assertTrue(core.ui.finishFailed)
    assertTrue(host.sessionRunning)
    assertEquals("failureHaptic", host.calls.last())
    core.acknowledgeFinishFailed()
    assertFalse(core.ui.finishFailed)
  }

  @Test fun noAnswerEndsTheSessionAfterTheTimeout() {
    startSession()
    core.requestFinish("f1", t0)
    core.tick(t0 + FinishHandshake.VERDICT_TIMEOUT_MS - 1)
    assertTrue(core.ui.finishing)
    core.tick(t0 + FinishHandshake.VERDICT_TIMEOUT_MS)
    assertFalse(core.ui.finishing)
    assertEquals("endSession", host.calls.last())
    // The phone has the request; nothing is queued on top of it.
    assertTrue(host.calls.none { it == "queueEnd" || it == "sendEnd" })
  }

  @Test fun outOfReachEndsAtOnceAndSendsAPlainEnd() {
    startSession()
    host.phoneReachable = false
    core.requestFinish("f1", t0)
    assertFalse(core.ui.finishing)
    assertEquals(listOf("endSession", "sendEnd"), host.calls.takeLast(2))
    assertEquals(WatchScreen.START, core.ui.screen)
  }

  @Test fun anUndeliverableRequestEndsAndQueuesAPlainEnd() {
    startSession()
    core.requestFinish("f1", t0)
    core.finishUndeliverable("f1")
    assertFalse(core.ui.finishing)
    assertEquals(listOf("endSession", "queueEnd"), host.calls.takeLast(2))
  }

  @Test fun aDeliveryFailureAfterTheTimeoutStillQueuesTheRequest() {
    startSession()
    core.requestFinish("f1", t0)
    core.tick(t0 + FinishHandshake.VERDICT_TIMEOUT_MS)
    core.finishUndeliverable("f1")
    assertEquals("queueEnd", host.calls.last())
    assertEquals(1, host.calls.count { it == "endSession" })
  }

  @Test fun thePhoneStoppingSettlesAWaitingFinish() {
    startSession()
    core.requestFinish("f1", t0)
    core.phoneEnded(discard = false)
    assertFalse(core.ui.finishing)
    // The late verdict for the settled request does nothing more.
    core.finishVerdict(FinishHandshake.Verdict.FAILED, "f1")
    assertFalse(core.ui.finishFailed)
    assertEquals(1, host.calls.count { it == "endSession" })
  }

  @Test fun aFailedFinishDoesNotFollowTheWatchOutOfTheWorkout() {
    startSession()
    core.requestFinish("f1", t0)
    core.finishVerdict(FinishHandshake.Verdict.FAILED, "f1")
    core.apply(PhoneState(screen = WatchScreen.START), t0 + 5_000)
    assertFalse(core.ui.finishFailed)
  }

  @Test fun finishWithNoSessionLeavesOnTheVerdict() {
    core.apply(session(), t0)
    core.requestFinish("f1", t0)
    assertTrue(core.needsTicking)
    core.finishVerdict(FinishHandshake.Verdict.FINISHED, "f1")
    assertEquals(WatchScreen.START, core.ui.screen)
    assertTrue(host.calls.none { it == "endSession" })
  }
}
