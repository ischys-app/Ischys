package app.ischys.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ActiveCaloriesTest {
  private val hour = 3_600_000L

  @Test fun subtractsOneKilocaloriePerKilogramPerActiveHour() {
    // 400 total over an hour at 80 kg: 80 of it would have been burned at rest.
    assertEquals(320, ActiveCalories.of(400.0, hour, 80.0))
    assertEquals(360, ActiveCalories.of(400.0, hour / 2, 80.0))
  }

  @Test fun neverGoesBelowZero() {
    assertEquals(0, ActiveCalories.of(30.0, hour, 80.0))
  }

  @Test fun withoutABodyweightThereIsNoActiveNumber() {
    assertNull(ActiveCalories.of(400.0, hour, 0.0))
    assertNull(ActiveCalories.of(400.0, hour, -5.0))
  }

  @Test fun nonsenseInIsNothingOut() {
    assertNull(ActiveCalories.of(Double.NaN, hour, 80.0))
    assertNull(ActiveCalories.of(400.0, -1L, 80.0))
  }
}
