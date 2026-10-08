package app.ischys.wear.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.wear.compose.foundation.pager.HorizontalPager
import androidx.wear.compose.foundation.pager.rememberPagerState
import app.ischys.wear.logic.UiState

/**
 * The paged workout: Active Set ⇄ Metrics ⇄ Controls.
 *
 * Rest is a non-blocking banner pinned over the pager — chrome, not a page —
 * so all three pages stay swipeable while resting. The finish cover goes over
 * everything while a finish is in flight or has just failed.
 */
@Composable
fun SessionScreen(ui: UiState) {
  val pager = rememberPagerState { 3 }
  // While the finish cover is up, nothing under it takes input.
  val covered = ui.finishing || ui.finishFailed

  Box(Modifier.fillMaxSize()) {
    HorizontalPager(
      state = pager,
      modifier = Modifier
        .fillMaxSize()
        .then(if (covered) Modifier.clearAndSetSemantics {} else Modifier),
      userScrollEnabled = !covered,
    ) { page ->
      when (page) {
        0 -> ActiveSetPage(ui, active = pager.currentPage == 0 && !covered)
        1 -> MetricsPage(ui)
        else -> ControlsPage(ui)
      }
    }

    AnimatedVisibility(
      visible = ui.resting && !covered,
      modifier = Modifier.align(Alignment.BottomCenter),
      enter = slideInVertically { it },
      exit = slideOutVertically { it },
    ) {
      RestBanner(ui)
    }

    // Hidden under the banner, which takes the bottom of the screen.
    if (!ui.resting && !covered) {
      PageDots(pager.currentPage, Modifier.align(Alignment.BottomCenter).padding(bottom = 3.s()))
    }

    if (covered) FinishCover(ui)
  }
}

@Composable
private fun PageDots(current: Int, modifier: Modifier = Modifier) {
  Row(modifier, horizontalArrangement = Arrangement.spacedBy(3.s())) {
    repeat(3) { page ->
      Box(
        Modifier
          .size(3.5.s())
          .background(if (page == current) Ischys.text1 else Ischys.surface3, CircleShape),
      )
    }
  }
}
