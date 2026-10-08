package app.ischys.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.TimeText
import app.ischys.wear.WorkoutModel
import app.ischys.wear.logic.WatchScreen

/** Top-level router. Pure black everywhere, per the design. */
@Composable
fun IschysApp() {
  val ui by WorkoutModel.ui
  val scale = LocalConfiguration.current.screenWidthDp / 192f
  MaterialTheme {
    CompositionLocalProvider(
      LocalAccent provides Ischys.accent(ui.themeId),
      LocalScale provides scale,
    ) {
      Box(Modifier.fillMaxSize().background(Ischys.bg)) {
        when (ui.screen) {
          WatchScreen.START -> StartScreen(ui)
          WatchScreen.SESSION -> SessionScreen(ui)
          WatchScreen.SUMMARY -> SummaryScreen(ui)
        }
        TimeText()
      }
    }
  }
}
