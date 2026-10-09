package app.ischys.wearlink

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecentSetTest {
  @Test fun aQueuedItemIsHandedOverOnceHoweverOftenItIsSeen() {
    val handled = RecentSet()
    val item = "wear://7855f02f/ischys/queued/e3c09216"
    // The sweep at launch and the Data Layer's own delivery, in either order.
    assertTrue(handled.add(item))
    assertFalse(handled.add(item))
    assertFalse(handled.add(item))
  }

  @Test fun differentItemsAreEachHandedOver() {
    val handled = RecentSet()
    assertTrue(handled.add("wear://n/ischys/queued/a"))
    assertTrue(handled.add("wear://n/ischys/queued/b"))
  }

  @Test fun itForgetsTheOldestRatherThanGrowing() {
    val handled = RecentSet(capacity = 2)
    handled.add("a")
    handled.add("b")
    handled.add("c")
    // "a" has been pushed out; the two newest are still known.
    assertFalse(handled.add("c"))
    assertFalse(handled.add("b"))
    assertTrue(handled.add("a"))
  }
}
