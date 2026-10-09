package app.ischys.wearlink

import app.ischys.wearlink.PendingActions.Fate
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * What happens to a Watch action that arrives with no JS to hear it, over the
 * same action fixtures the Watch's own tests encode (../../fixtures).
 */
class PendingActionsTest {
  private fun fate(json: String, appRunning: Boolean) =
    PendingActions.fate(JSONObject(json), appRunning)

  @Test fun workoutEndingActionsAreKept() {
    for (running in listOf(true, false)) {
      assertEquals(Fate.BUFFER, fate("""{"action":"end"}""", running))
      assertEquals(Fate.BUFFER, fate("""{"action":"discard"}""", running))
    }
  }

  @Test fun whatTheSessionMeasuredIsKept() {
    assertEquals(Fate.BUFFER, fate("""{"action":"sessionMetrics","avgHr":120}""", false))
    assertEquals(Fate.BUFFER, fate("""{"action":"workoutSaved","uuid":"u"}""", false))
  }

  @Test fun aFinishAwaitingAnAnswerIsRefusedWhenNoAppIsRunning() {
    assertEquals(Fate.REFUSE, fate("""{"action":"end","finishId":"f1"}""", false))
  }

  @Test fun aFinishAwaitingAnAnswerIsKeptWhileTheAppIsStillLoading() {
    // JS will drain it in a moment and answer.
    assertEquals(Fate.BUFFER, fate("""{"action":"end","finishId":"f1"}""", true))
  }

  @Test fun aStartIsNeverHeldForLater() {
    // Held, it would start a workout whenever the app was next opened.
    for (running in listOf(true, false)) {
      assertEquals(Fate.REFUSE, fate("""{"action":"startEmpty"}""", running))
      assertEquals(Fate.REFUSE, fate("""{"action":"startRoutine","routineId":"r"}""", running))
    }
  }

  @Test fun withNoAppRunningTheWatchIsToldRatherThanIgnored() {
    assertEquals(Fate.REFUSE, fate("""{"action":"logSet","weight":"100","reps":"8"}""", false))
    assertEquals(Fate.REFUSE, fate("""{"action":"adjustRest","seconds":15}""", false))
    assertEquals(Fate.REFUSE, fate("""{"action":"skipRest"}""", false))
    assertEquals(Fate.REFUSE, fate("""{"action":"addSet"}""", false))
    assertEquals(Fate.REFUSE, fate("""{"action":"requestState"}""", false))
  }

  @Test fun whileTheAppIsLoadingItWillPushItsStateSoNothingIsSaid() {
    assertEquals(Fate.DROP, fate("""{"action":"logSet","weight":"100","reps":"8"}""", true))
    assertEquals(Fate.DROP, fate("""{"action":"requestState"}""", true))
  }

  @Test fun whatIsNotAnActionIsDropped() {
    assertEquals(Fate.DROP, fate("""{}""", true))
    assertEquals(Fate.DROP, fate("""{}""", false))
    assertEquals(Fate.DROP, fate("""{"action":"somethingNew"}""", false))
  }

  @Test fun theRefusalNamesTheFinishOrElseTheAction() {
    assertEquals("""{"finishId":"f1"}""", WearSender.undeliverablePayload("f1", "end"))
    assertEquals("""{"action":"startRoutine"}""", WearSender.undeliverablePayload("", "startRoutine"))
  }

  @Test fun onlyAWatchThatCameBackIsSentTheStateAgain() {
    assertEquals(setOf("w1"), WearSender.returned(before = emptySet(), now = setOf("w1")))
    // Still in reach, or gone: nothing to resend.
    assertEquals(emptySet<String>(), WearSender.returned(setOf("w1"), setOf("w1")))
    assertEquals(emptySet<String>(), WearSender.returned(setOf("w1"), emptySet()))
    assertEquals(setOf("w2"), WearSender.returned(setOf("w1"), setOf("w1", "w2")))
  }

  @Test fun nothingIsLeftForAWatchThatDoesNotExist() {
    assertEquals(false, WearSender.worthQueueing(anyWatch = false))
    assertEquals(true, WearSender.worthQueueing(anyWatch = true))
    // Not yet known: a stop that is never delivered leaves a Watch recording.
    assertEquals(true, WearSender.worthQueueing(anyWatch = null))
  }

  @Test fun everySharedFixtureActionHasAFate() {
    val actions = JSONArray(File("../fixtures/actions.json").readText())
    val fates = (0 until actions.length()).map {
      val action = actions.getJSONObject(it)
      action.getString("action") to PendingActions.fate(action, appRunning = false)
    }
    assertEquals(
      listOf(
        "logSet" to Fate.REFUSE,
        "adjustRest" to Fate.REFUSE,
        "skipRest" to Fate.REFUSE,
        "end" to Fate.BUFFER,
        "end" to Fate.REFUSE,
        "discard" to Fate.BUFFER,
        "addSet" to Fate.REFUSE,
        "startEmpty" to Fate.REFUSE,
        "startRoutine" to Fate.REFUSE,
        "requestState" to Fate.REFUSE,
        "sessionMetrics" to Fate.BUFFER,
      ),
      fates,
    )
  }
}
