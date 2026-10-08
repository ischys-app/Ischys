package app.ischys.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The ground scripts/watch-tests/RestAlarmTests.swift covers for the Apple Watch. */
class RestAlarmTest {
  private val t0 = 1_000_000L
  private val end = t0 + 90_000

  @Test fun buzzesOnceWhenTheRestRunsOut() {
    val a = RestAlarm()
    assertFalse(a.update(true, end, true, t0))
    assertFalse(a.poll(end - 1))
    assertTrue(a.poll(end))
    assertFalse(a.poll(end + 1_000))
  }

  @Test fun repeatedPushesOfTheSameRestBuzzOnce() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    a.update(true, end, true, t0 + 1_000)
    assertTrue(a.poll(end))
    // The phone's last tick of the same rest, landing after our buzz.
    assertFalse(a.update(true, end, true, end + 200))
    assertFalse(a.poll(end + 1_000))
    assertFalse(a.update(false, null, true, end + 1_200))
  }

  @Test fun aSkippedRestIsSilent() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    assertFalse(a.update(false, null, true, t0 + 30_000))
    assertFalse(a.poll(end))
  }

  @Test fun anExtendedRestBuzzesAtItsNewEnd() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    a.update(true, end + 15_000, true, t0 + 10_000)
    assertFalse(a.poll(end))
    assertTrue(a.poll(end + 15_000))
  }

  @Test fun aShortenedRestBuzzesAtItsNewEnd() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    a.update(true, end - 15_000, true, t0 + 10_000)
    assertTrue(a.poll(end - 15_000))
    assertFalse(a.poll(end))
  }

  @Test fun thePhonesEndBeatingOurTimerStillBuzzes() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    // The phone noticed the end a fraction of a second ahead of our tick.
    assertTrue(a.update(false, null, true, end - 400))
    assertFalse(a.poll(end))
  }

  @Test fun alertsOffNeverBuzzes() {
    val a = RestAlarm()
    assertFalse(a.update(true, end, false, t0))
    assertEquals(null, a.armedFor)
    assertFalse(a.poll(end))
  }

  @Test fun turningAlertsOffMidRestDisarms() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    a.update(true, end, false, t0 + 5_000)
    assertFalse(a.poll(end))
  }

  @Test fun aRestLearnedOfTooLateIsNotBuzzed() {
    val a = RestAlarm()
    val late = end + RestAlarm.MAX_LATENESS_MS + 1
    assertFalse(a.update(true, end, true, late))
    // And it is dealt with: the same rest pushed again stays quiet.
    assertFalse(a.update(true, end, true, late + 100))
  }

  @Test fun aRestAlreadyOverWhenPushedBuzzesIfRecent() {
    val a = RestAlarm()
    assertTrue(a.update(true, end, true, end + 500))
  }

  @Test fun cancelDropsThePendingBuzz() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    a.cancel()
    assertFalse(a.poll(end))
  }

  @Test fun aSecondRestBuzzesToo() {
    val a = RestAlarm()
    a.update(true, end, true, t0)
    assertTrue(a.poll(end))
    val next = end + 200_000
    assertFalse(a.update(true, next, true, end + 100_000))
    assertTrue(a.poll(next))
  }

  @Test fun ownsTheBuzzWhileArmedAndJustAfterFiring() {
    val a = RestAlarm()
    assertFalse(a.owns(t0))
    a.update(true, end, true, t0)
    assertTrue(a.owns(t0 + 1))
    a.poll(end)
    assertTrue(a.owns(end + RestAlarm.OWNERSHIP_WINDOW_MS))
    assertFalse(a.owns(end + RestAlarm.OWNERSHIP_WINDOW_MS + 1))
  }
}
