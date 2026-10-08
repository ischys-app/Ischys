package app.ischys.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.ischys.wear.R

/**
 * Design tokens, the same values as `Theme.swift` in the Apple Watch target.
 * Watch screens use pure black to exploit the OLED.
 */
object Ischys {
  val bg = Color.Black
  val surface1 = Color(0xFF111113)
  val surface2 = Color(0xFF17171A)
  val surface3 = Color(0xFF212127)
  val border = Color(0xFF26262C)
  val hair = Color(0xFF1D1D22)

  val text1 = Color(0xFFF4F4F5)
  val text2 = Color(0xFF97979E)
  val text3 = Color(0xFF5B5B63)

  val accentFg = Color(0xFF0B0B0C)
  val success = Color(0xFF2DD881)
  val warning = Color(0xFFFFC24B)
  val error = Color(0xFFFF4D4D)
  val water = Color(0xFF4C8DFF)

  /**
   * Accent palettes, keyed by the ids the phone stores (src/theme/palettes.ts).
   * The ids are the contract; an unknown one falls back to Ember rather than
   * rendering no colour at all.
   */
  fun accent(themeId: String?): Color = when (themeId) {
    "volt" -> Color(0xFFC6F135)
    "ion" -> Color(0xFFC58BFF)
    "chalk" -> Color(0xFFF4F4F5)
    else -> Color(0xFFFF4A1C)
  }

  /** Interface text: Space Grotesk, as on the phone. */
  private val uiFamily = FontFamily(
    Font(R.font.space_grotesk_regular, FontWeight.Normal),
    Font(R.font.space_grotesk_medium, FontWeight.Medium),
    Font(R.font.space_grotesk_semibold, FontWeight.SemiBold),
    Font(R.font.space_grotesk_bold, FontWeight.Bold),
  )

  /** All numbers, timers and metric labels: JetBrains Mono, as on the phone. */
  private val monoFamily = FontFamily(
    Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
    Font(R.font.jetbrains_mono_semibold, FontWeight.SemiBold),
  )

  fun ui(size: TextUnit, weight: FontWeight = FontWeight.SemiBold, color: Color = text1) =
    TextStyle(fontFamily = uiFamily, fontSize = size, fontWeight = weight, color = color)

  fun mono(size: TextUnit, color: Color = text1, tracking: TextUnit = 0.sp) = TextStyle(
    fontFamily = monoFamily,
    fontSize = size,
    fontWeight = FontWeight.SemiBold,
    color = color,
    letterSpacing = tracking,
  )
}

/** The accent in force, from the theme the phone last pushed. */
val LocalAccent = staticCompositionLocalOf { Ischys.accent(null) }

/**
 * Screen width over the 192dp of the smallest round Watch the layouts were
 * drawn for. Every size goes through `s()`, so a larger screen gets the same
 * layout, bigger, and nothing depends on the system font scale.
 */
val LocalScale = staticCompositionLocalOf { 1f }

@Composable
fun Number.s(): Dp = (this.toFloat() * LocalScale.current).dp

/** A text size in the layout's own units. Dp-derived on purpose: see `LocalScale`. */
@Composable
fun Number.t(): TextUnit {
  val density = androidx.compose.ui.platform.LocalDensity.current
  return (this.toFloat() * LocalScale.current / density.fontScale).sp
}
