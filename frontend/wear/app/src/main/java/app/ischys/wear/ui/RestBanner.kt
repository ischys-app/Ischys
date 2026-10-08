package app.ischys.wear.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Text
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.Format
import app.ischys.wear.logic.UiState

/**
 * The non-blocking rest banner. Chrome over the pager, so the pages stay
 * swipeable while resting. On a round screen it is the lower half: its top
 * edge carries the progress line, and the screen's own curve is its bottom.
 *
 * The phone owns the countdown — every ±15 / Skip is sent to it and the
 * corrected rest is pushed straight back. The Watch only counts down to the
 * end date the phone gave it, so the banner keeps moving (and the wrist
 * buzzes) while the phone is locked.
 */
@Composable
fun RestBanner(ui: UiState) {
  val accent = LocalAccent.current
  val final = ui.restFinal
  // Fraction of the interval still remaining: the width of the progress line.
  val progress =
    if (ui.restTotal > 0) (ui.restRemaining.toFloat() / ui.restTotal).coerceIn(0f, 1f) else 0f
  // The countdown pulses at about 1 Hz in the final 10 s.
  val pulse by rememberInfiniteTransition(label = "rest").animateFloat(
    initialValue = 1f,
    targetValue = 0.5f,
    animationSpec = infiniteRepeatable(tween(500), RepeatMode.Reverse),
    label = "pulse",
  )
  val shape = RoundedCornerShape(topStart = 20.s(), topEnd = 20.s())

  Column(
    Modifier
      .fillMaxWidth()
      .height(96.s())
      .clip(shape)
      // Warm in the final stretch.
      .background(if (final) Color(0xFF17130F) else Color(0xFF131316))
      .border(1.dp, if (final) accent.copy(alpha = 0.42f) else Ischys.border, shape),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Box(Modifier.fillMaxWidth().height(2.dp)) {
      Box(Modifier.fillMaxWidth(progress).height(2.dp).background(accent))
    }

    Row(
      Modifier.fillMaxWidth().padding(start = 20.s(), end = 20.s(), top = 5.s()),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text("REST", style = Ischys.mono(7.5.t(), accent, 1.5.t()))
      Spacer(Modifier.width(5.s()))
      Text(
        Format.clock(ui.restRemaining),
        modifier = Modifier.alpha(if (final) pulse else 1f),
        style = Ischys.mono(20.t(), if (final) accent else Ischys.text1),
        maxLines = 1,
      )
      Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
        Text("NEXT", style = Ischys.mono(7.t(), Ischys.text3, 1.2.t()))
        Text(
          ui.nextSetLabel.removePrefix("Next: "),
          style = Ischys.ui(9.t(), color = Ischys.text2),
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
      }
    }

    Spacer(Modifier.height(4.s()))
    Row(horizontalArrangement = Arrangement.spacedBy(4.s())) {
      StepLabel("−15") { WorkoutModel.adjustRest(-15) }
      PillButton(
        onClick = { WorkoutModel.skipRest() },
        fill = accent,
        radius = 11.s(),
        modifier = Modifier.size(width = 60.s(), height = 30.s()),
      ) {
        // Final 10 s: Skip reads "Start set" — the rest is effectively over.
        Text(
          if (final) "Start set" else "Skip",
          style = Ischys.ui(if (final) 10.5.t() else 12.t(), FontWeight.Bold, Ischys.accentFg),
          maxLines = 1,
        )
      }
      StepLabel("+15") { WorkoutModel.adjustRest(15) }
    }
  }
}

@Composable
private fun StepLabel(text: String, onClick: () -> Unit) {
  PillButton(
    onClick = onClick,
    fill = Ischys.surface2,
    border = Ischys.border,
    radius = 11.s(),
    modifier = Modifier.size(width = 34.s(), height = 30.s()),
  ) {
    Text(text, style = Ischys.mono(10.t()), maxLines = 1)
  }
}
