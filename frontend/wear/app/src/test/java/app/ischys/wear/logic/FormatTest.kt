package app.ischys.wear.logic

import org.junit.Assert.assertEquals
import org.junit.Test

class FormatTest {
  @Test fun shortWeightKeepsOneDecimalAtMost() {
    assertEquals("149.9", Format.shortWeight("149.91"))
    assertEquals("225", Format.shortWeight("225"))
    assertEquals("225", Format.shortWeight("225.0"))
    assertEquals("102.5", Format.shortWeight("102.5"))
    assertEquals("24.8", Format.shortWeight("24,8"))
    assertEquals("abc", Format.shortWeight("abc"))
  }

  @Test fun clock() {
    assertEquals("0:00", Format.clock(-5))
    assertEquals("0:09", Format.clock(9))
    assertEquals("1:30", Format.clock(90))
    assertEquals("75:07", Format.clock(75 * 60 + 7))
  }

  @Test fun volumeAndGrouping() {
    assertEquals("800", Format.volume(800))
    assertEquals("9.2k", Format.volume(9200))
    assertEquals("9,177", Format.grouped(9177))
  }

  @Test fun weightStepsByTheUnit() {
    assertEquals("100.5", Format.stepWeight("100", 1, "kg"))
    assertEquals("99.5", Format.stepWeight("100", -1, "kg"))
    assertEquals("101", Format.stepWeight("100", 2, "kg"))
    assertEquals("227.5", Format.stepWeight("225", 1, "lb"))
    assertEquals("0", Format.stepWeight("0", -3, "kg"))
    assertEquals("0.5", Format.stepWeight("", 1, "kg"))
  }

  @Test fun aWeightOffTheGridLandsOnItAtTheFirstNotch() {
    // 100 kg shown in pounds.
    assertEquals("222.5", Format.stepWeight("220.46", 1, "lb"))
    assertEquals("217.5", Format.stepWeight("220.46", -1, "lb"))
  }

  @Test fun repsStepInWholes() {
    assertEquals("9", Format.stepReps("8", 1))
    assertEquals("0", Format.stepReps("1", -4))
    assertEquals("1", Format.stepReps("", 1))
  }
}
