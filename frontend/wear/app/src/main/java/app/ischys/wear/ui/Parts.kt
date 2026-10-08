package app.ischys.wear.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** A filled, rounded button holding a row of content. */
@Composable
fun PillButton(
  onClick: () -> Unit,
  fill: Color,
  radius: Dp,
  modifier: Modifier = Modifier,
  border: Color? = null,
  enabled: Boolean = true,
  content: @Composable RowScope.() -> Unit,
) {
  val shape = RoundedCornerShape(radius)
  Row(
    modifier
      .clip(shape)
      .background(fill)
      .then(if (border != null) Modifier.border(1.dp, border, shape) else Modifier)
      .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
    horizontalArrangement = Arrangement.Center,
    verticalAlignment = Alignment.CenterVertically,
    content = content,
  )
}

/** A tinted disc holding one mark: the success, failure and unavailable states. */
@Composable
fun Disc(glyph: Glyph, color: Color, size: Dp, fill: Color = color.copy(alpha = 0.15f)) {
  Box(Modifier.size(size).background(fill, CircleShape), contentAlignment = Alignment.Center) {
    GlyphIcon(glyph, color, size * 0.46f)
  }
}

/** A ring with an accent arc going round it: something is in flight. */
@Composable
fun SpinnerRing(size: Dp, track: Color, modifier: Modifier = Modifier) {
  val accent = LocalAccent.current
  val turn by rememberInfiniteTransition(label = "spinner").animateFloat(
    initialValue = 0f,
    targetValue = 360f,
    animationSpec = infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart),
    label = "turn",
  )
  Canvas(modifier.size(size)) {
    val width = 3.dp.toPx()
    val inset = Offset(width / 2, width / 2)
    val arc = Size(this.size.width - width, this.size.height - width)
    drawArc(track, 0f, 360f, false, inset, arc, style = Stroke(width))
    drawArc(accent, turn - 90f, 90f, false, inset, arc, style = Stroke(width, cap = StrokeCap.Round))
  }
}

/** Dims a block that is shown but not in play. */
fun Modifier.dimmed(on: Boolean) = if (on) alpha(0.34f) else this
