package app.ischys.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Text
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.RoutineItem
import app.ischys.wear.logic.UiState

/**
 * Start. The Watch's entry screen: pick a routine the phone has synced, or
 * start an empty workout. Every tap starts this Watch's session and asks the
 * phone to begin; the phone pushes back the state that moves to the session.
 *
 * Four states beyond the happy path: no routines (a dashed box), phone not
 * reachable (a warning chip, dimmed rows, and an Empty Workout that stays
 * enabled), phone in reach but Ischys not running on it (the same chip,
 * asking for it to be opened: nothing can be started there until it is), and
 * handing off (the tapped row holds a spinner while the phone spins the
 * workout up; the others dim).
 */
@Composable
fun StartScreen(ui: UiState) {
  val handingOff = ui.pendingRoutineId != null
  // A fresh appearance is never mid-handoff, and asks the phone for the
  // routine list: opened on its own, nothing else would ever send it.
  LaunchedEffect(Unit) { WorkoutModel.startAppeared() }

  ScalingLazyColumn(
    modifier = Modifier.fillMaxSize(),
    state = rememberScalingLazyListState(initialCenterItemIndex = 0),
    // Starts under the clock rather than centred: the first row is a title.
    autoCentering = null,
    contentPadding = PaddingValues(start = 12.s(), end = 12.s(), top = 26.s(), bottom = 34.s()),
    verticalArrangement = Arrangement.spacedBy(6.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    item { TitleRow() }
    // An unreachable phone is urgent, so the status moves up top as a warning.
    if (!ui.phoneReachable) {
      item { WarningChip("Phone not reachable") }
    } else if (ui.phoneAppClosed) {
      item { WarningChip("Open Ischys on phone") }
    }
    item { EmptyCard(ui.phoneReachable, handingOff) }
    item {
      Text(
        "ROUTINES",
        Modifier.fillMaxWidth().padding(start = 6.s(), top = 2.s()),
        style = Ischys.mono(8.t(), Ischys.text3, 1.2.t()),
      )
    }
    if (ui.routines.isEmpty()) {
      item { NoRoutinesBox() }
    } else {
      items(ui.routines, key = { it.id }) { routine ->
        val pending = ui.pendingRoutineId == routine.id
        RoutineRow(
          routine = routine,
          pending = pending,
          // Unreachable dims every row; a hand-off dims all but its own.
          dimmed = (!ui.phoneReachable && !handingOff) || (handingOff && !pending),
          enabled = !handingOff,
        )
      }
    }
    // The reassuring footer only earns its place when reachable and idle.
    if (ui.phoneReachable && !ui.phoneAppClosed && !handingOff) item { SyncedChip() }
  }
}

@Composable
private fun TitleRow() {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Text("Start", style = Ischys.ui(18.t(), FontWeight.Bold))
    Spacer(Modifier.width(5.s()))
    Box(Modifier.size(5.s()).background(LocalAccent.current, CircleShape))
  }
}

@Composable
private fun WarningChip(text: String) {
  val shape = RoundedCornerShape(12.s())
  Row(
    Modifier
      .fillMaxWidth()
      .background(Ischys.warning.copy(alpha = 0.09f), shape)
      .border(1.dp, Ischys.warning.copy(alpha = 0.24f), shape)
      .padding(7.s()),
    horizontalArrangement = Arrangement.Center,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    GlyphIcon(Glyph.WARNING, Ischys.warning, 10.s())
    Spacer(Modifier.width(5.s()))
    Text(text, style = Ischys.mono(8.5.t(), Color(0xFFFFD98A)), maxLines = 1)
  }
}

@Composable
private fun EmptyCard(reachable: Boolean, handingOff: Boolean) {
  val shape = RoundedCornerShape(17.s())
  Row(
    Modifier
      .fillMaxWidth()
      // Stays enabled offline; only a hand-off in flight dims it.
      .dimmed(handingOff)
      .clip(shape)
      .background(Ischys.surface1)
      .border(1.dp, Ischys.border, shape)
      .clickable(enabled = !handingOff) { WorkoutModel.startEmpty() }
      .padding(9.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(
      Modifier.size(32.s()).background(LocalAccent.current, CircleShape),
      contentAlignment = Alignment.Center,
    ) {
      GlyphIcon(Glyph.PLAY, Ischys.accentFg, 13.s())
    }
    Spacer(Modifier.width(9.s()))
    Column {
      Text("Empty Workout", style = Ischys.ui(13.t()), maxLines = 1)
      // Offline, sets logged on the wrist queue and reconcile, so say so
      // rather than blocking the one action that still works.
      Text(
        if (reachable) "Start fresh" else "Syncs on reconnect",
        style = Ischys.mono(8.5.t(), Ischys.text3),
        maxLines = 1,
      )
    }
  }
}

@Composable
private fun NoRoutinesBox() {
  val radius = 15.s()
  Column(
    Modifier
      .fillMaxWidth()
      .drawBehind {
        drawRoundRect(
          Ischys.border,
          cornerRadius = CornerRadius(radius.toPx()),
          style = Stroke(
            1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())),
          ),
        )
      }
      .padding(horizontal = 11.s(), vertical = 13.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text("No routines yet", style = Ischys.ui(11.5.t(), color = Ischys.text2))
    Spacer(Modifier.size(3.s()))
    Text(
      "Build one on your phone and it appears here.",
      style = Ischys.ui(10.t(), FontWeight.Normal, Ischys.text3),
      textAlign = TextAlign.Center,
    )
  }
}

@Composable
private fun RoutineRow(routine: RoutineItem, pending: Boolean, dimmed: Boolean, enabled: Boolean) {
  val accent = LocalAccent.current
  val shape = RoundedCornerShape(17.s())
  Row(
    Modifier
      .fillMaxWidth()
      .dimmed(dimmed)
      .clip(shape)
      .background(if (pending) accent.copy(alpha = 0.07f) else Ischys.surface1)
      .border(1.dp, if (pending) accent.copy(alpha = 0.4f) else Ischys.border, shape)
      // A dimmed or already-handing-off list must not start a second workout.
      .clickable(enabled = enabled) { WorkoutModel.startRoutine(routine.id) }
      .padding(9.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (pending) {
      SpinnerRing(32.s(), accent.copy(alpha = 0.25f))
    } else {
      Box(
        Modifier.size(32.s()).background(Ischys.surface3, RoundedCornerShape(10.s())),
        contentAlignment = Alignment.Center,
      ) {
        Text(routine.initials, style = Ischys.mono(11.5.t(), accent), maxLines = 1)
      }
    }
    Spacer(Modifier.width(9.s()))
    Column(Modifier.weight(1f)) {
      Text(
        routine.name,
        style = Ischys.ui(13.t()),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (pending) {
        Text("Starting on phone…", style = Ischys.mono(8.5.t(), accent), maxLines = 1)
      } else {
        Text(
          "${routine.exerciseCount} exercises",
          style = Ischys.mono(8.5.t(), Ischys.text3),
          maxLines = 1,
        )
      }
    }
    if (!pending) GlyphIcon(Glyph.CHEVRON, Ischys.text3, 11.s())
  }
}

@Composable
private fun SyncedChip() {
  val shape = RoundedCornerShape(12.s())
  Row(
    Modifier
      .background(Ischys.water.copy(alpha = 0.08f), shape)
      .border(1.dp, Ischys.water.copy(alpha = 0.18f), shape)
      .padding(horizontal = 10.s(), vertical = 6.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    GlyphIcon(Glyph.PHONE, Ischys.water, 10.s())
    Spacer(Modifier.width(5.s()))
    Text("Synced with phone", style = Ischys.mono(8.5.t(), Color(0xFF9FC0FF)))
  }
}
