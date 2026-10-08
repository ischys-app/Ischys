package app.ischys.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp

/** The handful of marks the screens need, drawn rather than shipped as an icon font. */
enum class Glyph {
  PLAY, STOP, PAUSE, CHECK, PLUS, MINUS, TRASH, WARNING, HEART, CHEVRON, PHONE, PHONE_OFF, EXCLAMATION
}

@Composable
fun GlyphIcon(glyph: Glyph, color: Color, size: Dp, modifier: Modifier = Modifier) {
  Canvas(modifier.size(size)) { draw(glyph, color) }
}

private fun DrawScope.draw(glyph: Glyph, color: Color) {
  val w = size.width
  val h = size.height
  val line = w * 0.13f
  val stroke = Stroke(line, cap = StrokeCap.Round, join = StrokeJoin.Round)
  fun p(x: Float, y: Float) = Offset(w * x, h * y)
  when (glyph) {
    Glyph.PLAY -> drawPath(
      Path().apply {
        moveTo(w * 0.27f, h * 0.14f); lineTo(w * 0.88f, h * 0.5f); lineTo(w * 0.27f, h * 0.86f); close()
      },
      color,
    )
    Glyph.STOP -> drawRoundRect(
      color, p(0.18f, 0.18f), Size(w * 0.64f, h * 0.64f), CornerRadius(w * 0.12f),
    )
    Glyph.PAUSE -> {
      drawRoundRect(color, p(0.2f, 0.15f), Size(w * 0.22f, h * 0.7f), CornerRadius(w * 0.06f))
      drawRoundRect(color, p(0.58f, 0.15f), Size(w * 0.22f, h * 0.7f), CornerRadius(w * 0.06f))
    }
    Glyph.CHECK -> drawPath(
      Path().apply {
        moveTo(w * 0.16f, h * 0.54f); lineTo(w * 0.4f, h * 0.77f); lineTo(w * 0.85f, h * 0.25f)
      },
      color, style = Stroke(w * 0.15f, cap = StrokeCap.Round, join = StrokeJoin.Round),
    )
    Glyph.PLUS -> {
      drawLine(color, p(0.5f, 0.16f), p(0.5f, 0.84f), line, StrokeCap.Round)
      drawLine(color, p(0.16f, 0.5f), p(0.84f, 0.5f), line, StrokeCap.Round)
    }
    Glyph.MINUS -> drawLine(color, p(0.16f, 0.5f), p(0.84f, 0.5f), line, StrokeCap.Round)
    Glyph.TRASH -> {
      val thin = Stroke(w * 0.09f, cap = StrokeCap.Round, join = StrokeJoin.Round)
      drawLine(color, p(0.14f, 0.26f), p(0.86f, 0.26f), w * 0.09f, StrokeCap.Round)
      drawLine(color, p(0.38f, 0.13f), p(0.62f, 0.13f), w * 0.09f, StrokeCap.Round)
      drawPath(
        Path().apply {
          moveTo(w * 0.24f, h * 0.3f); lineTo(w * 0.3f, h * 0.88f)
          lineTo(w * 0.7f, h * 0.88f); lineTo(w * 0.76f, h * 0.3f)
        },
        color, style = thin,
      )
      drawLine(color, p(0.42f, 0.44f), p(0.42f, 0.74f), w * 0.07f, StrokeCap.Round)
      drawLine(color, p(0.58f, 0.44f), p(0.58f, 0.74f), w * 0.07f, StrokeCap.Round)
    }
    Glyph.WARNING -> {
      drawPath(
        Path().apply {
          moveTo(w * 0.5f, h * 0.1f); lineTo(w * 0.95f, h * 0.88f); lineTo(w * 0.05f, h * 0.88f); close()
        },
        color,
      )
      drawLine(Color.Black, p(0.5f, 0.4f), p(0.5f, 0.62f), w * 0.1f, StrokeCap.Round)
      drawCircle(Color.Black, w * 0.055f, p(0.5f, 0.76f))
    }
    Glyph.HEART -> drawPath(
      Path().apply {
        moveTo(w * 0.5f, h * 0.9f)
        cubicTo(w * 0.1f, h * 0.62f, w * 0.02f, h * 0.38f, w * 0.14f, h * 0.22f)
        cubicTo(w * 0.26f, h * 0.06f, w * 0.44f, h * 0.1f, w * 0.5f, h * 0.26f)
        cubicTo(w * 0.56f, h * 0.1f, w * 0.74f, h * 0.06f, w * 0.86f, h * 0.22f)
        cubicTo(w * 0.98f, h * 0.38f, w * 0.9f, h * 0.62f, w * 0.5f, h * 0.9f)
        close()
      },
      color,
    )
    Glyph.CHEVRON -> drawPath(
      Path().apply {
        moveTo(w * 0.36f, h * 0.18f); lineTo(w * 0.68f, h * 0.5f); lineTo(w * 0.36f, h * 0.82f)
      },
      color, style = stroke,
    )
    Glyph.PHONE, Glyph.PHONE_OFF -> {
      val thin = Stroke(w * 0.1f)
      drawRoundRect(color, p(0.27f, 0.08f), Size(w * 0.46f, h * 0.84f), CornerRadius(w * 0.1f), style = thin)
      drawLine(color, p(0.43f, 0.78f), p(0.57f, 0.78f), w * 0.08f, StrokeCap.Round)
      if (glyph == Glyph.PHONE_OFF) {
        drawLine(color, p(0.1f, 0.12f), p(0.9f, 0.9f), w * 0.1f, StrokeCap.Round)
      }
    }
    Glyph.EXCLAMATION -> {
      drawLine(color, p(0.5f, 0.14f), p(0.5f, 0.6f), w * 0.16f, StrokeCap.Round)
      drawCircle(color, w * 0.09f, p(0.5f, 0.84f))
    }
  }
}
