package dev.canvas.launcher.apps

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.UserHandle
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import dev.canvas.launcher.data.IconRef
import dev.canvas.launcher.data.IconShape
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

/** Everything that changes how an icon is drawn. Part of the cache key. */
data class IconStyle(
    val sizePx: Int,
    val shape: IconShape,
    val pack: String?,
    val themed: Boolean,
    val themedFg: Int,
    val themedBg: Int,
    val legacyBackground: Boolean,
)

class IconCache(private val context: Context) {

    private val memory = object : LruCache<String, ImageBitmap>((Runtime.getRuntime().maxMemory() / 8).toInt()) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }

    private val _version = MutableStateFlow(0)
    /** Bumped whenever cached icons become stale, so visible icons reload. */
    val version: StateFlow<Int> = _version.asStateFlow()

    private val densityDpi get() = context.resources.displayMetrics.densityDpi

    fun peek(key: String): ImageBitmap? = memory.get(key)

    fun keyFor(appKey: String, style: IconStyle, override: IconRef?) = "$appKey#${style.hashCode()}#${override?.hashCode()}"

    suspend fun appIcon(app: RawApp, style: IconStyle, override: IconRef?): ImageBitmap {
        val key = keyFor(app.key, style, override)
        memory.get(key)?.let { return it }
        return withContext(Dispatchers.Default) {
            val bmp = renderApp(app, style, override)
            memory.put(key, bmp)
            bmp
        }
    }

    /** Renders any drawable (shortcut icons, folder previews...) with the current style. */
    suspend fun drawableIcon(key: String, style: IconStyle, load: () -> Drawable?): ImageBitmap? {
        val full = "$key#${style.hashCode()}"
        memory.get(full)?.let { return it }
        return withContext(Dispatchers.Default) {
            val d = load() ?: return@withContext null
            render(d, style, fromPack = false).asImageBitmap().also { memory.put(full, it) }
        }
    }

    private fun renderApp(app: RawApp, style: IconStyle, override: IconRef?): ImageBitmap {
        // 1. A per-app icon the user picked by hand.
        override?.let { ref ->
            IconPack.get(context, ref.pack)?.load(ref.drawable, densityDpi)?.let {
                return badge(render(it, style, fromPack = true), app.user, app.isWork)
            }
        }
        // 2. The active icon pack.
        style.pack?.let { pkg ->
            val pack = IconPack.get(context, pkg)
            val name = pack?.drawableNameFor(app.component)
            if (pack != null && name != null) pack.load(name, densityDpi)?.let {
                return badge(render(it, style, fromPack = true), app.user, app.isWork)
            }
        }
        // 3. The app's own icon.
        val drawable = app.info.getIcon(densityDpi)
        return badge(render(drawable, style, fromPack = false), app.user, app.isWork)
    }

    private fun badge(bmp: Bitmap, user: UserHandle, isWork: Boolean): ImageBitmap {
        if (!isWork) return bmp.asImageBitmap()
        val badged = context.packageManager.getUserBadgedIcon(BitmapDrawable(context.resources, bmp), user)
        return drawToBitmap(badged, bmp.width).asImageBitmap()
    }

    fun render(drawable: Drawable, style: IconStyle, fromPack: Boolean): Bitmap {
        val s = style.sizePx.coerceAtLeast(1)
        if (fromPack) return drawToBitmap(drawable, s)

        val adaptive = drawable as? AdaptiveIconDrawable
        val mono = if (Build.VERSION.SDK_INT >= 33) adaptive?.monochrome else null

        // Themed (monochrome) icons, Android 13+.
        if (style.themed && mono != null) {
            val content = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
            val c = Canvas(content)
            c.drawColor(style.themedBg)
            val m = mono.mutate()
            m.setTint(style.themedFg)
            drawLayer(c, m, s)
            return mask(content, style.shape, s)
        }

        if (adaptive != null) {
            if (style.shape == IconShape.SYSTEM) return drawToBitmap(adaptive, s)
            val content = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
            val c = Canvas(content)
            adaptive.background?.let { drawLayer(c, it, s) }
            adaptive.foreground?.let { drawLayer(c, it, s) }
            return mask(content, style.shape, s)
        }

        // Legacy (pre-Android 8) icons: optionally place them on a shaped background.
        if (!style.legacyBackground) return drawToBitmap(drawable, s)
        val content = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(content)
        c.drawColor(if (style.themed) style.themedBg else 0xFFF4F4F4.toInt())
        val inset = (s * 0.16f).toInt()
        drawable.setBounds(inset, inset, s - inset, s - inset)
        drawable.draw(c)
        return mask(content, style.shape, s)
    }

    /** Adaptive layers are 1.5× the visible icon; draw them centred and overflowing. */
    private fun drawLayer(c: Canvas, d: Drawable, s: Int) {
        val extra = (s * 0.25f).toInt()
        d.setBounds(-extra, -extra, s + extra, s + extra)
        d.draw(c)
    }

    private fun mask(content: Bitmap, shape: IconShape, s: Int): Bitmap {
        val out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        c.drawPath(shape.path(s.toFloat(), s.toFloat()), paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        c.drawBitmap(content, 0f, 0f, paint)
        content.recycle()
        return out
    }

    private fun drawToBitmap(d: Drawable, s: Int): Bitmap {
        val out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        d.setBounds(0, 0, s, s)
        d.draw(c)
        return out
    }

    fun invalidate(packageName: String) {
        memory.snapshot().keys.filter { it.startsWith("$packageName/") || it.contains("sc:$packageName:") }
            .forEach { memory.remove(it) }
        _version.update { it + 1 }
    }

    fun invalidateAll() {
        memory.evictAll()
        _version.update { it + 1 }
    }
}
