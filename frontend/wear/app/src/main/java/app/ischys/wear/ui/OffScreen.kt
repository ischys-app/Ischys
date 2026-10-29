package app.ischys.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Text
import app.ischys.wear.logic.UiState

/**
 * Another profile is active on the phone, and Health and the Watch are the
 * owner's alone. One centred message, no buttons: the name is the profile whose
 * workout it is, and a long one wraps rather than being cut.
 */
@Composable
fun OffScreen(ui: UiState) {
  val name = ui.profileName.trim()
  Column(
    Modifier.fillMaxSize().padding(horizontal = 24.s()),
    verticalArrangement = Arrangement.spacedBy(8.s(), Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    GlyphIcon(Glyph.HEART, Ischys.text3, 22.s())
    Text(
      if (name.isEmpty()) "Watch is off for this profile" else "Watch is off for $name",
      style = Ischys.ui(13.t(), FontWeight.SemiBold, Ischys.text1),
      textAlign = TextAlign.Center,
    )
  }
}
