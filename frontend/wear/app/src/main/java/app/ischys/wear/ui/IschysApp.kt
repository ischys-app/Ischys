package app.ischys.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.MaterialTheme
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.WatchScreen

/**
 * Top-level router. Pure black everywhere, per the design.
 *
 * AppScaffold owns the clock; each screen wraps itself in a ScreenScaffold,
 * which shows a scroll indicator on lists and moves the clock out of the way
 * as they scroll (Wear app quality: scrollbar, watch shapes).
 */
@Composable
fun IschysApp() {
  val ui by WorkoutModel.ui
  val scale = LocalConfiguration.current.screenWidthDp / 192f
  MaterialTheme {
    CompositionLocalProvider(
      LocalAccent provides Ischys.accent(ui.themeId),
      LocalScale provides scale,
    ) {
      AppScaffold(containerColor = Ischys.bg) {
        when (ui.screen) {
          WatchScreen.START -> StartScreen(ui)
          WatchScreen.SESSION -> SessionScreen(ui)
          WatchScreen.SUMMARY -> SummaryScreen(ui)
          WatchScreen.OFF -> OffScreen(ui)
        }
      }
    }
  }
}
