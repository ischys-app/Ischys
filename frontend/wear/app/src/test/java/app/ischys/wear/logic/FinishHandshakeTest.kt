package app.ischys.wear.logic

import app.ischys.wear.logic.FinishHandshake.Start
import app.ischys.wear.logic.FinishHandshake.Step
import app.ischys.wear.logic.FinishHandshake.Verdict
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The ground scripts/watch-tests/FinishHandshakeTests.swift covers for the Apple Watch. */
class FinishHandshakeTest {
  private val t0 = 1_000_000L
  private val timeout = FinishHandshake.VERDICT_TIMEOUT_MS

  @Test fun asksWhenThePhoneIsReachable() {
    val h = FinishHandshake()
    assertEquals(Start.ASK, h.begin("a", t0, true))
    assertTrue(h.isWaiting)
    assertEquals(t0 + timeout, h.deadline)
  }

  @Test fun endsAtOnceWhenThePhoneIsOutOfReach() {
    val h = FinishHandshake()
    assertEquals(Start.END_NOW, h.begin("a", t0, false))
    assertFalse(h.isWaiting)
  }

  @Test fun aSecondTapWhileWaitingIsIgnored() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Start.IGNORE, h.begin("b", t0 + 1, true))
    // The first request is still the one being waited on.
    assertEquals(Step.NONE, h.verdict(Verdict.FINISHED, "b"))
    assertEquals(Step.END_AND_SAVE, h.verdict(Verdict.FINISHED, "a"))
  }

  @Test fun finishedEndsAndSaves() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Step.END_AND_SAVE, h.verdict(Verdict.FINISHED, "a"))
    assertFalse(h.isWaiting)
  }

  @Test fun failedKeepsRecordingAndAllowsARetry() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Step.KEEP_RECORDING, h.verdict(Verdict.FAILED, "a"))
    assertFalse(h.isWaiting)
    assertEquals(Start.ASK, h.begin("b", t0 + 5_000, true))
  }

  @Test fun anAnswerArrivingTwiceActsOnce() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Step.END_AND_SAVE, h.verdict(Verdict.FINISHED, "a"))
    assertEquals(Step.NONE, h.verdict(Verdict.FINISHED, "a"))
  }

  @Test fun anAnswerToAnEarlierRequestIsIgnored() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    h.verdict(Verdict.FAILED, "a")
    h.begin("b", t0 + 1_000, true)
    assertEquals(Step.NONE, h.verdict(Verdict.FINISHED, "a"))
    assertTrue(h.isWaiting)
  }

  @Test fun noAnswerEndsAndSavesAtTheDeadline() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Step.NONE, h.poll(t0 + timeout - 1))
    assertEquals(Step.END_AND_SAVE, h.poll(t0 + timeout))
    assertFalse(h.isWaiting)
    assertEquals(Step.NONE, h.poll(t0 + timeout + 1_000))
  }

  @Test fun aLateAnswerAfterTheTimeoutDoesNothing() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    h.poll(t0 + timeout)
    assertEquals(Step.NONE, h.verdict(Verdict.FAILED, "a"))
    assertEquals(Step.NONE, h.verdict(Verdict.FINISHED, "a"))
  }

  @Test fun aClockSetBackNeverWaitsLongerThanTheTimeout() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    val earlier = t0 - 3_600_000
    assertEquals(Step.NONE, h.poll(earlier))
    assertEquals(earlier + timeout, h.deadline)
    assertEquals(Step.END_AND_SAVE, h.poll(earlier + timeout))
  }

  @Test fun anUndeliverableRequestEndsAndQueues() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Step.END_AND_QUEUE_REQUEST, h.undeliverable("a"))
    assertFalse(h.isWaiting)
    assertEquals(Step.NONE, h.undeliverable("a"))
  }

  @Test fun aDeliveryFailureReportedAfterTheTimeoutStillQueuesTheRequest() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    assertEquals(Step.END_AND_SAVE, h.poll(t0 + timeout))
    // Giving up ends the session, which cancels; the failure can still come.
    h.cancel()
    assertEquals(Step.QUEUE_REQUEST, h.undeliverable("a"))
    assertEquals(Step.NONE, h.undeliverable("a"))
  }

  @Test fun anAnswerAfterGivingUpMeansThePhoneHasTheRequest() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    h.poll(t0 + timeout)
    assertEquals(Step.NONE, h.verdict(Verdict.FINISHED, "a"))
    assertEquals(Step.NONE, h.undeliverable("a"))
  }

  @Test fun aNewRequestForgetsTheOneGivenUpOn() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    h.poll(t0 + timeout)
    h.begin("b", t0 + 60_000, true)
    // A finish queued for "a" now would land on the workout "b" is about.
    assertEquals(Step.NONE, h.undeliverable("a"))
    assertTrue(h.isWaiting)
  }

  @Test fun cancelStopsTheWait() {
    val h = FinishHandshake()
    h.begin("a", t0, true)
    h.cancel()
    assertFalse(h.isWaiting)
    assertEquals(Step.NONE, h.verdict(Verdict.FINISHED, "a"))
    assertEquals(Step.NONE, h.poll(t0 + timeout))
  }

  @Test fun theTimeoutMatchesThePhones() {
    // WATCH_VERDICT_TIMEOUT_MS in src/lib/watchFinish.ts.
    assertEquals(8_000L, FinishHandshake.VERDICT_TIMEOUT_MS)
  }

  @Test fun verdictsDecodeFromTheWire() {
    assertEquals(Verdict.FINISHED, Verdict.fromWire("finished"))
    assertEquals(Verdict.FAILED, Verdict.fromWire("failed"))
    assertEquals(null, Verdict.fromWire("maybe"))
  }
}
