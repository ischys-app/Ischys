package app.ischys.wear.ui

import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.wear.compose.foundation.ScrollInfoProvider
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.ScrollIndicator

/**
 * The scaffold for a list screen: a scroll indicator at the edge while the list
 * moves, and the clock scrolling away with the list instead of sitting on top
 * of it. Both are Wear app quality requirements ("Missing scrollbar", "Watch
 * shapes").
 *
 * Our lists start under the clock rather than centred (`autoCentering = null`),
 * and the stock scroll info measures scrolling from item 1. On Start, item 1
 * is the warning chip one moment and the Empty Workout card the next, so the
 * swap reads as scrolling and the clock half-hides at the top. Item 0 is always
 * a title that does not move, so scrolling is measured from it instead.
 */
@Composable
fun ListScaffold(state: ScalingLazyListState, content: @Composable BoxScope.() -> Unit) {
  val scrollInfo = remember(state) { TopAnchoredScrollInfo(state) }
  ScreenScaffold(
    scrollInfoProvider = scrollInfo,
    contentPadding = PaddingValues(),
    scrollIndicator = { ScrollIndicator(state) },
  ) { _ -> content() }
}

private class TopAnchoredScrollInfo(private val state: ScalingLazyListState) : ScrollInfoProvider {
  private val stock = ScrollInfoProvider(state)

  /** Where item 0 sits when the list is at its top. */
  private var topOffset: Float? = null

  override val isScrollAwayValid: Boolean
    get() = state.layoutInfo.totalItemsCount > 0

  override val isScrollable: Boolean
    get() = stock.isScrollable

  override val isScrollInProgress: Boolean
    get() = stock.isScrollInProgress

  override val lastItemOffset: Float
    get() = stock.lastItemOffset

  override val anchorItemOffset: Float
    get() {
      // NaN tells the scaffold the anchor is off screen: the clock hides.
      val first = state.layoutInfo.visibleItemsInfo.firstOrNull { it.index == 0 }
        ?: return Float.NaN
      val offset = first.offset.toFloat()
      // Re-learnt whenever the list rests at its top, so a row appearing or
      // going below the title never counts as scrolling.
      if (!state.canScrollBackward || topOffset == null) topOffset = offset
      return (topOffset!! - offset).coerceAtLeast(0f)
    }
}
