package app.ischys.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Text
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.Format
import app.ischys.wear.logic.SessionSummary
import app.ischys.wear.logic.UiState
import kotlinx.coroutines.delay

/** How long to wait for the phone's recap before deciding it isn't coming. */
private const val RECAP_TIMEOUT_MS = 8_000L

/**
 * Summary. The end-of-session recap the phone pushes. Three states share the
 * screen: the recap with an accent Done; saving, the wait before the phone's
 * push; and unavailable, when the push never lands — the workout is still
 * saved, so the copy reassures and Done goes neutral.
 */
@Composable
fun SummaryScreen(ui: UiState) {
  var timedOut by remember { mutableStateOf(false) }
  val summary = ui.summary
  // A single wait per appearance. A summary that arrives meanwhile wins.
  LaunchedEffect(Unit) {
    if (summary == null) {
      delay(RECAP_TIMEOUT_MS)
      timedOut = true
    }
  }

  ScalingLazyColumn(
    modifier = Modifier.fillMaxSize(),
    state = rememberScalingLazyListState(initialCenterItemIndex = 0),
    // Starts under the clock rather than centred: the first row is a title.
    autoCentering = null,
    contentPadding = PaddingValues(start = 12.s(), end = 12.s(), top = 24.s(), bottom = 34.s()),
    verticalArrangement = Arrangement.spacedBy(5.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    when {
      summary != null -> recap(summary)
      timedOut -> unavailable()
      else -> saving()
    }
  }
}

private fun ScalingLazyListScope.recap(s: SessionSummary) {
  item {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Disc(Glyph.CHECK, Ischys.success, 40.s())
      Spacer(Modifier.height(4.s()))
      Text("Nice work", style = Ischys.ui(17.t(), FontWeight.Bold))
      Text(
        "${s.routineName} · ${s.dateLabel}",
        style = Ischys.mono(8.5.t(), Ischys.text3),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
  }
  item { StatRow("TIME", s.timeLabel, Ischys.text1) }
  item { StatRow("VOLUME", "${Format.grouped(s.volume)} ${s.unit}", Ischys.text1) }
  item { StatRow("SETS", "${s.sets}", Ischys.text1) }
  item { StatRow("AVG HR", "${s.avgHr} bpm", Ischys.error) }
  item { StatRow("CALORIES", "${s.activeCal}", Ischys.warning) }
  item { StatRow("PRs", "${s.prs}", Ischys.success) }
  item {
    PillButton(
      onClick = { WorkoutModel.leaveSummary() },
      fill = LocalAccent.current,
      radius = 14.s(),
      modifier = Modifier.fillMaxWidth().height(34.s()),
    ) {
      Text("Done", style = Ischys.ui(13.t(), FontWeight.Bold, Ischys.accentFg))
    }
  }
}

@Composable
private fun StatRow(label: String, value: String, color: Color) {
  val shape = RoundedCornerShape(13.s())
  Row(
    Modifier
      .fillMaxWidth()
      .background(Ischys.surface1, shape)
      .border(1.dp, Ischys.border, shape)
      .padding(horizontal = 9.s(), vertical = 7.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, style = Ischys.mono(7.5.t(), Ischys.text3, 0.8.t()))
    Spacer(Modifier.weight(1f))
    Text(value, style = Ischys.mono(13.t(), color), maxLines = 1)
  }
}

private fun ScalingLazyListScope.saving() {
  item {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      SpinnerRing(40.s(), Ischys.surface3)
      Spacer(Modifier.height(7.s()))
      Text("Saving…", style = Ischys.ui(16.t(), FontWeight.Bold, Ischys.text2))
      Text("Sending to phone", style = Ischys.mono(8.5.t(), Ischys.text3))
    }
  }
  listOf(34 to 46, 46 to 58, 28 to 24, 40 to 52).forEach { (label, value) ->
    item { PlaceholderRow(label.s(), value.s()) }
  }
}

@Composable
private fun PlaceholderRow(labelWidth: Dp, valueWidth: Dp) {
  val shape = RoundedCornerShape(13.s())
  Row(
    Modifier
      .fillMaxWidth()
      .background(Ischys.surface1, shape)
      .border(1.dp, Ischys.hair, shape)
      .padding(horizontal = 9.s(), vertical = 8.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(labelWidth, 6.s()).background(Ischys.surface3, RoundedCornerShape(3.s())))
    Spacer(Modifier.weight(1f))
    Box(Modifier.size(valueWidth, 10.s()).background(Ischys.surface3, RoundedCornerShape(3.s())))
  }
}

private fun ScalingLazyListScope.unavailable() {
  item {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Box(
        Modifier.size(40.s()).background(Ischys.surface2, CircleShape).border(1.dp, Ischys.border, CircleShape),
        contentAlignment = Alignment.Center,
      ) {
        GlyphIcon(Glyph.PHONE_OFF, Ischys.text3, 17.s())
      }
      Spacer(Modifier.height(7.s()))
      Text("Recap not here yet", style = Ischys.ui(14.5.t(), FontWeight.Bold), textAlign = TextAlign.Center)
    }
  }
  item {
    Text(
      "Your workout is saved. Open Ischys on your phone to see the full summary.",
      modifier = Modifier.padding(horizontal = 4.s()),
      style = Ischys.ui(10.t(), FontWeight.Normal, Ischys.text2),
      textAlign = TextAlign.Center,
    )
  }
  item {
    PillButton(
      onClick = { WorkoutModel.leaveSummary() },
      fill = Ischys.surface2,
      border = Ischys.border,
      radius = 14.s(),
      modifier = Modifier.fillMaxWidth().height(34.s()),
    ) {
      Text("Done", style = Ischys.ui(12.5.t()))
    }
  }
}
