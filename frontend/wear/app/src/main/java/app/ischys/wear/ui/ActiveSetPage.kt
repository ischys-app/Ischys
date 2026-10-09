package app.ischys.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Text
import app.ischys.wear.Haptics
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.Format
import app.ischys.wear.logic.SetDot
import app.ischys.wear.logic.UiState
import kotlin.math.abs
import kotlin.math.roundToInt

private enum class Field { WEIGHT, REPS }

/**
 * How far the crown turns for one notch, in dp of rotary scroll. A bezel or a
 * detented crown reports a whole detent in one event, about 64dp; a smooth
 * crown reports a stream of small ones.
 */
private const val NOTCH_DP = 24f
private const val DETENT_DP = 64f

/**
 * Active Set, the core screen. Mirrors the set the phone is on. The crown — or
 * the − / + beside the weight, for a Watch without one — adjusts whichever
 * value is selected (tap weight or reps to switch), and Log Set sends it back
 * to the phone, which advances.
 */
@Composable
fun ActiveSetPage(ui: UiState, active: Boolean) {
  // Nothing left to log: the page becomes the end-of-workout state rather
  // than stranding the user on a Log Set button with no set to log.
  if (ui.allSetsDone) {
    EndOfWorkout(ui)
    return
  }

  var editing by rememberSaveable { mutableStateOf(Field.WEIGHT) }
  val step: (Int) -> Unit = { notches ->
    if (editing == Field.WEIGHT) WorkoutModel.stepWeight(notches) else WorkoutModel.stepReps(notches)
  }

  val focus = remember { FocusRequester() }
  var turned by remember { mutableFloatStateOf(0f) }
  val density = LocalDensity.current.density
  val view = LocalView.current
  // A notch of the crown ticks, as it does on the Apple Watch. − / + do not.
  val turn: (Int) -> Unit = { notches ->
    step(notches)
    Haptics.crownNotch(view)
  }
  // The crown goes to whichever page is showing; this one takes it back each
  // time it is.
  LaunchedEffect(active, ui.resting) { if (active && !ui.resting) focus.requestFocus() }

  Column(
    Modifier
      .fillMaxSize()
      .onRotaryScrollEvent { event ->
        if (ui.resting) return@onRotaryScrollEvent false
        val dp = event.verticalScrollPixels / density
        if (abs(dp) >= DETENT_DP * 0.75f) {
          // Whole detents: one click of the bezel is one notch.
          turned = 0f
          turn((dp / DETENT_DP).roundToInt())
        } else {
          turned += dp
          val notches = (turned / NOTCH_DP).toInt()
          if (notches != 0) {
            turned -= notches * NOTCH_DP
            turn(notches)
          }
        }
        true
      }
      .focusRequester(focus)
      .focusable()
      .padding(top = 21.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    StatusRow(ui)
    ExerciseHeader(ui)
    if (ui.resting) {
      // The banner takes the lower half of the screen. The set is already
      // logged, so what was logged stands in for the editable values, dimmed.
      Spacer(Modifier.height(1.s()))
      Text(
        "${Format.shortWeight(ui.weight.ifEmpty { "0" })} ${ui.unit} × ${ui.reps.ifEmpty { "0" }}",
        modifier = Modifier.alpha(0.45f),
        style = Ischys.mono(14.t()),
        maxLines = 1,
      )
      Text("LOGGED", style = Ischys.mono(7.5.t(), Ischys.success, 1.2.t()))
    } else {
      ValueBlock(ui, editing, onSelect = { editing = it }, onStep = step)
      Spacer(Modifier.weight(1f))
      SetDots(ui.setDots)
      Spacer(Modifier.height(4.s()))
      LogButton()
      Spacer(Modifier.height(11.s()))
    }
  }
}

// Heart + HR. The elapsed clock is not here: it lives on the Metrics page,
// and the system clock is drawn above this row.
@Composable
private fun StatusRow(ui: UiState) {
  // Nothing tapped here takes effect until the phone app is opened, which
  // matters more than the heart rate (still on the Metrics page).
  if (ui.phoneReachable && ui.phoneAppClosed) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      GlyphIcon(Glyph.WARNING, Ischys.warning, 8.5.s())
      Spacer(Modifier.width(3.s()))
      Text("Open Ischys on phone", style = Ischys.mono(8.5.t(), Ischys.warning), maxLines = 1)
    }
    return
  }
  Row(verticalAlignment = Alignment.CenterVertically) {
    GlyphIcon(Glyph.HEART, Ischys.error, 8.5.s())
    Spacer(Modifier.width(3.s()))
    Text(if (ui.heartRate > 0) "${ui.heartRate}" else "--", style = Ischys.mono(10.t()))
  }
}

@Composable
private fun ExerciseHeader(ui: UiState) {
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 24.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    // Above the name, because inside a superset no rest timer starts between
    // partners — without saying so, that reads as the timer being broken.
    if (ui.supersetLabel.isNotEmpty()) {
      Text(ui.supersetLabel, style = Ischys.mono(7.5.t(), Ischys.text3), maxLines = 1)
    }
    Text(
      ui.exerciseName,
      style = Ischys.ui(14.t(), color = LocalAccent.current),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
    Text(
      "Set ${ui.setNum} of ${ui.setCount} · ${ui.equipment}",
      style = Ischys.mono(8.5.t(), Ischys.text3),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
  }
}

@Composable
private fun ValueBlock(
  ui: UiState,
  editing: Field,
  onSelect: (Field) -> Unit,
  onStep: (Int) -> Unit,
) {
  val accent = LocalAccent.current
  val quiet = remember { MutableInteractionSource() }
  val weight = if (ui.weight.isEmpty()) "0" else Format.shortWeight(ui.weight)
  // Sized to fit between the steppers: "100" has room that "102.5" has not.
  val weightSize = when {
    weight.length <= 3 -> 36
    weight.length == 4 -> 32
    weight.length == 5 -> 27
    else -> 23
  }

  Row(
    Modifier.fillMaxWidth().padding(horizontal = 7.s()).height(42.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Stepper(Glyph.MINUS) { onStep(-1) }
    // Tap to choose which value the crown edits; the selected one takes the accent.
    Row(
      Modifier.weight(1f).clickable(quiet, null) { onSelect(Field.WEIGHT) },
      horizontalArrangement = Arrangement.Center,
      verticalAlignment = Alignment.Bottom,
    ) {
      Text(
        weight,
        modifier = Modifier.alignByBaseline(),
        style = Ischys.mono(weightSize.t(), if (editing == Field.WEIGHT) accent else Ischys.text1, (-1).t()),
        maxLines = 1,
      )
      Spacer(Modifier.width(2.s()))
      Text(
        ui.unit,
        modifier = Modifier.alignByBaseline(),
        style = Ischys.ui(12.t(), FontWeight.Medium, Ischys.text2),
      )
    }
    Stepper(Glyph.PLUS) { onStep(1) }
  }

  Row(
    Modifier.clickable(quiet, null) { onSelect(Field.REPS) }.padding(horizontal = 12.s()),
    verticalAlignment = Alignment.Bottom,
  ) {
    Text("×", modifier = Modifier.alignByBaseline(), style = Ischys.mono(18.t(), Ischys.text3))
    Spacer(Modifier.width(4.s()))
    Text(
      ui.reps.ifEmpty { "0" },
      modifier = Modifier.alignByBaseline(),
      style = Ischys.mono(20.t(), if (editing == Field.REPS) accent else Ischys.text1),
    )
    Spacer(Modifier.width(4.s()))
    Text(
      "reps",
      modifier = Modifier.alignByBaseline(),
      style = Ischys.ui(11.t(), FontWeight.Medium, Ischys.text2),
    )
  }

  // The superset label takes a line of the header, and on a round screen
  // there is exactly one line to give: the previous-set hint makes way for it.
  if (ui.supersetLabel.isEmpty()) {
    val prev = if (ui.prevWeight.isEmpty() && ui.prevReps.isEmpty()) {
      " "
    } else {
      "prev  ${Format.shortWeight(ui.prevWeight)} ${ui.unit} × ${ui.prevReps}"
    }
    Text(prev, style = Ischys.mono(8.t(), Ischys.text3), maxLines = 1)
  }
}

@Composable
private fun Stepper(glyph: Glyph, onClick: () -> Unit) {
  Box(
    Modifier
      .size(26.s())
      .clip(CircleShape)
      .background(Ischys.surface2)
      .border(1.dp, Ischys.border, CircleShape)
      .clickable(onClick = onClick),
    contentAlignment = Alignment.Center,
  ) {
    GlyphIcon(glyph, Ischys.text2, 10.s())
  }
}

// One pill per set: done and active in accent (active wider), pending grey.
@Composable
private fun SetDots(dots: List<SetDot>) {
  Row(
    Modifier.height(5.s()),
    horizontalArrangement = Arrangement.spacedBy(3.s()),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    dots.forEach { dot ->
      Box(
        Modifier
          .size(width = if (dot == SetDot.ACTIVE) 14.s() else 5.s(), height = 5.s())
          .background(
            if (dot == SetDot.PENDING) Ischys.surface3 else LocalAccent.current,
            CircleShape,
          ),
      )
    }
  }
}

@Composable
private fun LogButton() {
  PillButton(
    onClick = { WorkoutModel.logSet() },
    fill = LocalAccent.current,
    radius = 15.s(),
    modifier = Modifier.size(width = 100.s(), height = 29.s()),
  ) {
    GlyphIcon(Glyph.CHECK, Ischys.accentFg, 11.s())
    Spacer(Modifier.width(5.s()))
    Text("Log Set", style = Ischys.ui(13.t(), FontWeight.Bold, Ischys.accentFg))
  }
}

/**
 * End of workout, shown on the Active Set page once every planned set is
 * logged. Finish is what the user came to do, so it takes the accent; adding
 * hands off to the phone, the only place the exercise library lives. Finish
 * here and on Controls are the same action and read the same.
 */
@Composable
private fun EndOfWorkout(ui: UiState) {
  val name = ui.routineName.ifEmpty { "Workout" }
  Column(
    Modifier.fillMaxSize().padding(top = 22.s()),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Disc(Glyph.CHECK, Ischys.success, 36.s())
    Spacer(Modifier.height(4.s()))
    Text("All sets done", style = Ischys.ui(16.t(), FontWeight.Bold))
    Text(
      "$name · ${ui.setsDone} sets · ${Format.clock(ui.elapsedSec)}",
      modifier = Modifier.padding(horizontal = 18.s()),
      style = Ischys.mono(8.5.t(), Ischys.text3),
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.weight(1f))
    PillButton(
      onClick = { WorkoutModel.requestFinish() },
      fill = LocalAccent.current,
      radius = 15.s(),
      modifier = Modifier.size(width = 134.s(), height = 32.s()),
    ) {
      GlyphIcon(Glyph.STOP, Ischys.accentFg, 11.s())
      Spacer(Modifier.width(5.s()))
      Text("Finish Workout", style = Ischys.ui(13.t(), FontWeight.Bold, Ischys.accentFg))
    }
    Spacer(Modifier.height(5.s()))
    // The Watch cannot browse the exercise library, so this hands off: the
    // phone appends a set the user can then edit there.
    PillButton(
      onClick = { WorkoutModel.addSet() },
      fill = Ischys.surface2,
      border = Ischys.border,
      radius = 13.s(),
      modifier = Modifier.size(width = 112.s(), height = 26.s()),
    ) {
      GlyphIcon(Glyph.PHONE, Ischys.water, 10.s())
      Spacer(Modifier.width(4.s()))
      Text("Add from phone", style = Ischys.ui(10.5.t(), color = Ischys.text2))
    }
    Spacer(Modifier.height(11.s()))
  }
}
