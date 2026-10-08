package app.ischys.health

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * What Health Connect shows when the user asks why Ischys wants their data:
 * the link on its permission screen, and "Read privacy policy" on Ischys's
 * page in its settings. Health Connect requires an app to answer it.
 *
 * Plain views rather than a React screen, so that it opens instantly and on
 * its own, whether or not the app is running.
 */
class PermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), dp(32), dp(24), dp(32))
    }
    column.addView(text("Ischys and Health Connect", 22f, TEXT_1, bold = true))
    column.addView(heading("WHAT ISCHYS WRITES"))
    column.addView(
      body(
        "Each workout you finish, as a strength training session: when it started and " +
          "ended, and the active calories for it when another device measured them."
      )
    )
    column.addView(heading("WHAT ISCHYS READS"))
    column.addView(
      body(
        "Heart rate and active calories over the time of a workout, to show its average " +
          "and maximum heart rate and the calories burned. Your latest weight, so that " +
          "bodyweight exercises count toward volume. Your latest body fat, for your " +
          "measurement history."
      )
    )
    column.addView(heading("WHERE IT GOES"))
    column.addView(
      body(
        "Nowhere. It stays on this device, is used only for those things, and never for " +
          "advertising. You can turn any of it off in Health Connect at any time; Ischys " +
          "keeps working without it."
      )
    )
    column.addView(
      text("Read the privacy policy", 15f, ACCENT, bold = true).apply {
        setPadding(0, dp(28), 0, dp(12))
        isClickable = true
        setOnClickListener { openPolicy() }
      }
    )

    val scroll = ScrollView(this).apply {
      setBackgroundColor(BACKGROUND)
      // Android 15 draws edge to edge; keep the text clear of the system bars.
      fitsSystemWindows = true
      addView(column, MATCH_PARENT, WRAP_CONTENT)
    }
    setContentView(scroll)
  }

  private fun openPolicy() {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL)))
    } catch (_: Exception) {
      // No browser to open it with.
    }
  }

  private fun heading(value: String): View =
    text(value, 11f, TEXT_3).apply {
      letterSpacing = 0.14f
      setPadding(0, dp(26), 0, dp(8))
    }

  private fun body(value: String): View =
    text(value, 15f, TEXT_2).apply { setLineSpacing(dp(4).toFloat(), 1f) }

  private fun text(value: String, size: Float, color: Int, bold: Boolean = false): TextView =
    TextView(this).apply {
      text = value
      setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
      setTextColor(color)
      if (bold) setTypeface(typeface, Typeface.BOLD)
    }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private companion object {
    const val PRIVACY_URL = "https://ischys.app/privacy"

    // The app's own dark surface and text colours (src/theme/tokens.ts).
    val BACKGROUND = Color.parseColor("#0A0A0B")
    val TEXT_1 = Color.parseColor("#F4F4F5")
    val TEXT_2 = Color.parseColor("#97979E")
    val TEXT_3 = Color.parseColor("#5B5B63")
    val ACCENT = Color.parseColor("#F4F4F5")
  }
}
