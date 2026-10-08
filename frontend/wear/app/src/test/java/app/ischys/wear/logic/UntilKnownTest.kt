package app.ischys.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class UntilKnownTest {
  @Test
  fun `work is held until the answer is in, then run in order`() {
    val gate = UntilKnown()
    val ran = ArrayList<String>()
    gate.run { ran += "requestState" }
    gate.run { ran += "sessionMetrics" }
    assertEquals(emptyList<String>(), ran)

    gate.nowKnown()
    assertEquals(listOf("requestState", "sessionMetrics"), ran)
  }

  @Test
  fun `once known, work runs at once`() {
    val gate = UntilKnown()
    gate.nowKnown()
    val ran = ArrayList<String>()
    gate.run { ran += "logSet" }
    assertEquals(listOf("logSet"), ran)
  }

  @Test
  fun `held work runs once, however often the answer changes`() {
    val gate = UntilKnown()
    var runs = 0
    gate.run { runs += 1 }
    gate.nowKnown()
    gate.nowKnown()
    assertEquals(1, runs)
  }

  @Test
  fun `work that sends more while being released is not lost or reordered`() {
    val gate = UntilKnown()
    val ran = ArrayList<String>()
    gate.run {
      ran += "first"
      gate.run { ran += "nested" }
    }
    gate.run { ran += "second" }
    gate.nowKnown()
    assertEquals(listOf("first", "nested", "second"), ran)
  }
}
