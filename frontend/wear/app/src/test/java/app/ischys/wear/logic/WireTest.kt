package app.ischys.wear.logic

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The wire contract, against the fixtures the phone side shares
 * (modules/wear-link/fixtures). The states there are built by the phone's real
 * builders — `protocol.test.ts` beside them checks that — so decoding them
 * here is decoding what the phone sends.
 */
class WireTest {
  private val fixtures = File("../../modules/wear-link/fixtures")
  private fun fixture(name: String) = JSONObject(File(fixtures, name).readText())

  private fun state(name: String): PhoneState =
    (Wire.parseInbound(fixture(name)) as Wire.Inbound.State).state

  @Test fun decodesASessionState() {
    val s = state("state-session.json")
    assertEquals(WatchScreen.SESSION, s.screen)
    assertEquals(1_760_000_000_000L, s.startedAt)
    assertEquals("Push Day", s.routineName)
    assertEquals("Bench Press", s.exerciseName)
    assertEquals("Barbell", s.equipment)
    assertEquals(2, s.setNum)
    assertEquals(3, s.setCount)
    assertEquals("100", s.weight)
    assertEquals("8", s.reps)
    assertEquals("97.5", s.prevWeight)
    assertEquals("8", s.prevReps)
    assertEquals(listOf(SetDot.DONE, SetDot.ACTIVE, SetDot.PENDING), s.setDots)
    assertEquals(false, s.resting)
    assertNull(s.restEndsAt)
    assertEquals(true, s.restAlerts)
    assertEquals("Next: Set 2 of 3", s.nextSetLabel)
    assertEquals("kg", s.unit)
    assertEquals(1, s.setsDone)
    assertEquals(5, s.setsTotal)
    assertEquals("ember", s.themeId)
    // A session push carries no routines, which is not the same as none.
    assertNull(s.routines)
  }

  @Test fun decodesARestingState() {
    val s = state("state-resting.json")
    assertEquals(true, s.resting)
    assertEquals(90, s.restRemaining)
    assertEquals(120, s.restTotal)
    assertEquals(1_760_000_900_000L, s.restEndsAt)
    assertEquals("lb", s.unit)
    assertEquals(800, s.volume)
    assertEquals("volt", s.themeId)
  }

  @Test fun decodesTheAllSetsDoneState() {
    val s = state("state-finished.json")
    assertEquals(WatchScreen.SESSION, s.screen)
    assertEquals(5, s.setsDone)
    assertEquals(5, s.setsTotal)
    assertTrue(s.setDots.all { it == SetDot.DONE })
  }

  @Test fun decodesTheStartScreenPush() {
    val s = state("state-start.json")
    assertEquals(WatchScreen.START, s.screen)
    assertEquals(
      listOf(RoutineItem("r1", "Push Day", "PD", 5), RoutineItem("r2", "Pull Day", "PL", 6)),
      s.routines,
    )
    // No unit in a Start push: the last known one stands.
    assertNull(s.unit)
    assertNull(s.startedAt)
  }

  @Test fun aVerdictOnItsOwnIsNotAState() {
    val v = Wire.parseInbound(fixture("verdict-only.json")) as Wire.Inbound.Verdict
    assertEquals(FinishHandshake.Verdict.FAILED, v.verdict)
    assertEquals("finish-1", v.finishId)
    assertNull(v.state)
  }

  @Test fun aVerdictCanTravelWithAState() {
    val v = Wire.parseInbound(fixture("verdict-with-state.json")) as Wire.Inbound.Verdict
    assertEquals(FinishHandshake.Verdict.FINISHED, v.verdict)
    assertEquals("finish-2", v.finishId)
    assertEquals("Bench Press", v.state?.exerciseName)
  }

  @Test fun decodesCommands() {
    val stop = Wire.parseInbound(JSONObject("""{"cmd":"stop","sentAt":1760000000000}"""))
    assertEquals(Wire.Inbound.Command("stop", 1_760_000_000_000L), stop)
    val discard = Wire.parseInbound(JSONObject("""{"cmd":"discard"}"""))
    assertEquals(Wire.Inbound.Command("discard", null), discard)
  }

  @Test fun aPartialPushFallsBackRatherThanThrowing() {
    val s = PhoneState.from(JSONObject("""{"screen":"session","setNum":2.0,"unit":"stone"}"""))
    assertEquals(WatchScreen.SESSION, s.screen)
    assertEquals(2, s.setNum)
    assertEquals(1, s.setCount)
    assertEquals("", s.weight)
    assertNull(s.unit)
    assertNull(s.startedAt)
    assertEquals(emptyList<SetDot>(), s.setDots)
  }

  @Test fun decodesASummary() {
    val s = PhoneState.from(
      JSONObject(
        """{"screen":"summary","unit":"lb","summary":{"routineName":"Push Day","dateLabel":"Oct 8",
          "timeLabel":"52:10","volume":9177,"sets":18,"avgHr":121,"activeCal":312,"prs":2}}""",
      ),
    )
    assertEquals(WatchScreen.SUMMARY, s.screen)
    assertEquals(
      SessionSummary("Push Day", "Oct 8", "52:10", 9177, "lb", 18, 121, 312, 2),
      s.summary,
    )
  }

  @Test fun encodesEveryActionAsThePhoneExpectsIt() {
    val expected = JSONArray(File(fixtures, "actions.json").readText())
    val actual = listOf(
      Wire.logSet("102.5", "6", "kg"),
      Wire.adjustRest(-15),
      Wire.skipRest(),
      Wire.end(),
      Wire.endAsking("finish-1"),
      Wire.discard(),
      Wire.addSet(),
      Wire.startEmpty(),
      Wire.startRoutine("r1"),
      Wire.requestState(),
      Wire.sessionMetrics(1_760_000_000_000L, 1_760_003_600_000L, 121, 164, 312),
    )
    assertEquals(expected.length(), actual.size)
    actual.forEachIndexed { i, action ->
      // Through text, as it travels.
      val sent = JSONObject(action.toString())
      assertEquals("action $i", fields(expected.getJSONObject(i)), fields(sent))
    }
  }

  @Test fun encodesMetrics() {
    assertEquals(fields(fixture("metrics.json")), fields(JSONObject(Wire.metrics(128, 42).toString())))
  }

  /** A flat JSON object as a map, numbers as doubles so 1 and 1.0 compare equal. */
  private fun fields(o: JSONObject): Map<String, Any> =
    o.keys().asSequence().associateWith { key ->
      val value = o.get(key)
      if (value is Number) value.toDouble() else value
    }
}
