package dev.canvas.launcher.apps

import android.graphics.Matrix
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.ColorDrawable
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import dev.canvas.launcher.data.IconShape
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin

/** Builds an outline path for [shape] filling a [w]×[h] box. */
fun IconShape.path(w: Float, h: Float): Path {
    val p = Path()
    when (this) {
        IconShape.SYSTEM -> {
            // The device's own adaptive-icon mask, defined in a 100×100 box.
            val mask = Path(AdaptiveIconDrawable(ColorDrawable(0), ColorDrawable(0)).iconMask)
            val bounds = RectF()
            @Suppress("DEPRECATION") mask.computeBounds(bounds, true)
            val m = Matrix()
            m.setRectToRect(bounds, RectF(0f, 0f, w, h), Matrix.ScaleToFit.FILL)
            mask.transform(m)
            p.addPath(mask)
        }
        IconShape.CIRCLE -> p.addOval(RectF(0f, 0f, w, h), Path.Direction.CW)
        IconShape.SQUARE -> p.addRect(RectF(0f, 0f, w, h), Path.Direction.CW)
        IconShape.ROUNDED -> p.addRoundRect(RectF(0f, 0f, w, h), w * 0.22f, h * 0.22f, Path.Direction.CW)
        IconShape.TEARDROP -> {
            val r = w / 2f
            p.addRoundRect(
                RectF(0f, 0f, w, h),
                floatArrayOf(r, r, r, r, w * 0.12f, h * 0.12f, r, r),
                Path.Direction.CW,
            )
        }
        IconShape.SQUIRCLE -> superellipse(p, w, h, 4.0)
        IconShape.PEBBLE -> superellipse(p, w, h, 2.6)
        IconShape.HEXAGON -> {
            for (i in 0 until 6) {
                val a = PI / 3 * i - PI / 2
                val x = (w / 2 + w / 2 * cos(a)).toFloat()
                val y = (h / 2 + h / 2 * sin(a)).toFloat()
                if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
            }
            p.close()
        }
    }
    return p
}

private fun superellipse(p: Path, w: Float, h: Float, n: Double) {
    val steps = 96
    for (i in 0..steps) {
        val t = 2 * PI * i / steps
        val c = cos(t); val s = sin(t)
        val x = (w / 2) * (1 + sign(c) * abs(c).pow(2 / n))
        val y = (h / 2) * (1 + sign(s) * abs(s).pow(2 / n))
        if (i == 0) p.moveTo(x.toFloat(), y.toFloat()) else p.lineTo(x.toFloat(), y.toFloat())
    }
    p.close()
}

/** The same shapes, usable as Compose [Shape]s (folder backgrounds, pickers...). */
class IconComposeShape(private val shape: IconShape) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline =
        Outline.Generic(shape.path(size.width, size.height).asComposePath())
}
