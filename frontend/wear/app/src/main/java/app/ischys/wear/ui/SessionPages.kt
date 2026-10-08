package app.ischys.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Text
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.Format
import app.ischys.wear.logic.UiState

/**
 * Metrics. A read-only glance at the live workout, and the one place several
 * semantic colours are used at once (heart rate red, calories amber, sets
 * green). The elapsed clock keeps the accent, as everywhere else.
 */
@Composable
fun MetricsPage(ui: UiState) {
  ScalingLazyColumn(
    modifier = Modifier.fillMaxSize(),
    state = rememberScalingLazyListState(initialCenterItemIndex = 0),
    // Starts under the clock rather than centred, so the elapsed time and the
    // first row of tiles are on screen without scrolling.
    autoCentering = null,
    // Room to scroll the tiles clear of the rest banner while it is up.
    contentPadding = PaddingValues(
      start = 10.s(), end = 10.s(), top = 22.s(), bottom = if (ui.resting) 104.s() else 30.s(),
    ),
    verticalArrangement = Arrangement.spacedBy(3.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    item {
      Text(
        ui.routineName.ifEmpty { "Workout" },
        style = Ischys.mono(10.t(), Ischys.text2),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
    item {
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          if (ui.paused) "PAUSED" else "ELAPSED",
          style = Ischys.mono(8.t(), if (ui.paused) Ischys.warning else Ischys.text3, 1.5.t()),
        )
        Text(Format.clock(ui.elapsedSec), style = Ischys.mono(32.t(), LocalAccent.current))
      }
    }
    item {
      Row(horizontalArrangement = Arrangement.spacedBy(5.s())) {
        StatCard("HEART RATE") {
          Text(
            if (ui.heartRate > 0) "${ui.heartRate}" else "--",
            modifier = Modifier.alignByBaseline(),
            style = Ischys.mono(17.t(), Ischys.error),
          )
          Spacer(Modifier.width(2.s()))
          Text("bpm", modifier = Modifier.alignByBaseline(), style = Ischys.ui(8.5.t(), color = Ischys.text2))
        }
        StatCard("CALORIES") {
          Text("${ui.activeCal}", style = Ischys.mono(17.t(), Ischys.warning))
        }
      }
    }
    item {
      Row(horizontalArrangement = Arrangement.spacedBy(5.s())) {
        StatCard("VOLUME") {
          Text(
            Format.volume(ui.volume),
            modifier = Modifier.alignByBaseline(),
            style = Ischys.mono(17.t()),
            maxLines = 1,
          )
          Spacer(Modifier.width(2.s()))
          Text(ui.unit, modifier = Modifier.alignByBaseline(), style = Ischys.ui(8.5.t(), color = Ischys.text2))
        }
        StatCard("SETS") {
          Text("${ui.setsDone} / ${ui.setsTotal}", style = Ischys.mono(17.t(), Ischys.success), maxLines = 1)
        }
      }
    }
  }
}

/** One metric tile: a label over a big value, on a bordered surface. */
@Composable
private fun RowScope.StatCard(label: String, value: @Composable RowScope.() -> Unit) {
  val shape = RoundedCornerShape(14.s())
  Column(
    Modifier
      .weight(1f)
      .background(Ischys.surface1, shape)
      .border(1.dp, Ischys.border, shape)
      .padding(horizontal = 8.s(), vertical = 6.s()),
  ) {
    Text(label, style = Ischys.mono(7.t(), Ischys.text3, 0.8.t()), maxLines = 1)
    Row(verticalAlignment = Alignment.Bottom, content = value)
  }
}

/**
 * Controls. Four circular actions for the running session. Finish asks the
 * phone to finish and ends this Watch's session once it has; Discard ends it
 * at once and tells the phone; Pause holds the session; Add asks the phone to
 * append a set. These only send intents — the phone holds the data.
 *
 * Finish saves, so it takes the accent; the action that loses data is Discard,
 * which takes the error red.
 */
@Composable
fun ControlsPage(ui: UiState) {
  Column(
    Modifier.fillMaxSize().padding(top = 8.s()),
    verticalArrangement = Arrangement.spacedBy(6.s(), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.s())) {
      ControlButton(LocalAccent.current, Glyph.STOP, "Finish") { WorkoutModel.requestFinish() }
      if (ui.paused) {
        ControlButton(Ischys.warning, Glyph.PLAY, "Resume") { WorkoutModel.togglePause() }
      } else {
        ControlButton(Ischys.warning, Glyph.PAUSE, "Pause") { WorkoutModel.togglePause() }
      }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(14.s())) {
      ControlButton(Ischys.error, Glyph.TRASH, "Discard") { WorkoutModel.discard() }
      ControlButton(Ischys.water, Glyph.PLUS, "Add") { WorkoutModel.addSet() }
    }
  }
}

/** One circular action: a tinted disc with a mark, a label below. */
@Composable
private fun ControlButton(color: Color, glyph: Glyph, label: String, onClick: () -> Unit) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Box(
      Modifier
        .size(46.s())
        .clip(CircleShape)
        .background(color.copy(alpha = 0.14f))
        .border(1.dp, color.copy(alpha = 0.4f), CircleShape)
        .clickable(onClick = onClick),
      contentAlignment = Alignment.Center,
    ) {
      GlyphIcon(glyph, color, 18.s())
    }
    Spacer(Modifier.height(2.s()))
    Text(label, style = Ischys.ui(10.t(), color = Ischys.text2))
  }
}

/**
 * What covers the session pages around a Finish. Finish does not end the
 * workout on the spot: the phone is asked, and the Watch keeps recording until
 * it answers. In between, this says so and keeps the pages underneath from
 * being tapped or swiped. If the phone could not finish, it says that instead
 * and stays until acknowledged: the wrist has usually dropped by then, and
 * coming back to an ordinary session screen would read as Finish having been
 * ignored.
 */
@Composable
fun FinishCover(ui: UiState) {
  val swallow = remember { MutableInteractionSource() }
  Column(
    Modifier
      .fillMaxSize()
      .background(Ischys.bg)
      // The whole cover is a touch target, so a touch anywhere on it lands on
      // it and not on what is underneath.
      .clickable(swallow, null) {}
      .padding(top = 24.s(), bottom = 14.s()),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    if (ui.finishing) {
      SpinnerRing(44.s(), Ischys.surface3)
      Spacer(Modifier.height(9.s()))
      Text("Finishing…", style = Ischys.ui(17.t(), FontWeight.Bold))
      Spacer(Modifier.height(3.s()))
      Text("Saving on phone", style = Ischys.mono(9.t(), Ischys.text3))
    } else {
      Disc(Glyph.EXCLAMATION, Ischys.error, 38.s())
      Spacer(Modifier.height(6.s()))
      Text("Couldn’t finish", style = Ischys.ui(16.t(), FontWeight.Bold), maxLines = 1)
      Spacer(Modifier.height(2.s()))
      Text("Still recording. Try again.", style = Ischys.mono(8.5.t(), Ischys.text3), maxLines = 1)
      Spacer(Modifier.height(10.s()))
      PillButton(
        onClick = { WorkoutModel.acknowledgeFinishFailed() },
        fill = Ischys.surface2,
        border = Ischys.border,
        radius = 13.s(),
        modifier = Modifier.size(width = 120.s(), height = 30.s()),
      ) {
        Text("Back to workout", style = Ischys.ui(11.t(), color = Ischys.text2))
      }
    }
  }
}
