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

  @Test fun everythingElseOnlyMeantSomethingAtTheTime() {
    assertEquals(Fate.DROP, fate("""{"action":"logSet","weight":"100","reps":"8"}""", false))
    assertEquals(Fate.DROP, fate("""{"action":"startEmpty"}""", true))
    assertEquals(Fate.DROP, fate("""{"action":"requestState"}""", true))
    assertEquals(Fate.DROP, fate("""{}""", true))
  }

  @Test fun everySharedFixtureActionHasAFate() {
    val actions = JSONArray(File("../fixtures/actions.json").readText())
    val fates = (0 until actions.length()).map {
      val action = actions.getJSONObject(it)
      action.getString("action") to PendingActions.fate(action, appRunning = false)
    }
    assertEquals(
      listOf(
        "logSet" to Fate.DROP,
        "adjustRest" to Fate.DROP,
        "skipRest" to Fate.DROP,
        "end" to Fate.BUFFER,
        "end" to Fate.REFUSE,
        "discard" to Fate.BUFFER,
        "addSet" to Fate.DROP,
        "startEmpty" to Fate.DROP,
        "startRoutine" to Fate.DROP,
        "requestState" to Fate.DROP,
        "sessionMetrics" to Fate.BUFFER,
      ),
      fates,
    )
  }
}
