package dev.canvas.launcher.ui

import android.graphics.Rect
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.canvas.launcher.apps.IconComposeShape
import dev.canvas.launcher.apps.IconStyle
import dev.canvas.launcher.data.BadgeStyle
import dev.canvas.launcher.data.FolderItem
import dev.canvas.launcher.data.FolderPreview
import dev.canvas.launcher.data.IconRef
import dev.canvas.launcher.data.IconShape
import dev.canvas.launcher.data.LauncherConfig
import dev.canvas.launcher.data.ShortcutItem

val LocalVm = staticCompositionLocalOf<LauncherViewModel> { error("No view model") }
val LocalConfig = compositionLocalOf { LauncherConfig() }
val LocalIconOverrides = compositionLocalOf<Map<String, IconRef>> { emptyMap() }
val LocalBadges = compositionLocalOf<Map<String, Int>> { emptyMap() }
val LocalWallpaperLight = compositionLocalOf { false }

/** Builds the icon style for a given on-screen size from the current config and colours. */
@Composable
fun rememberIconStyle(sizeDp: Int): IconStyle {
    val cfg = LocalConfig.current.icons
    val px = with(LocalDensity.current) { sizeDp.dp.roundToPx() }
    val scheme = MaterialTheme.colorScheme
    return remember(cfg, px, scheme.primaryContainer, scheme.onPrimaryContainer) {
        IconStyle(
            sizePx = px, shape = cfg.shape, pack = cfg.iconPack, themed = cfg.themedIcons,
            themedFg = scheme.onPrimaryContainer.toArgb(), themedBg = scheme.primaryContainer.toArgb(),
            legacyBackground = cfg.legacyIconBackground,
        )
    }
}

@Composable
fun AppIconImage(app: AppInfo, style: IconStyle, size: Dp, modifier: Modifier = Modifier) {
    val vm = LocalVm.current
    val version by vm.icons.version.collectAsState()
    val override = LocalIconOverrides.current[app.key]
    val key = vm.icons.keyFor(app.key, style, override)
    val bmp by produceState(vm.icons.peek(key), key, version) {
        value = vm.icons.appIcon(app.raw, style, override)
    }
    IconBitmap(bmp, size, modifier)
}

@Composable
fun IconBitmap(bmp: ImageBitmap?, size: Dp, modifier: Modifier = Modifier) {
    val b = bmp
    if (b != null) Image(bitmap = b, contentDescription = null, modifier = modifier.size(size))
    else Box(modifier.size(size))
}

@Composable
fun ShortcutIconImage(item: ShortcutItem, style: IconStyle, size: Dp) {
    val vm = LocalVm.current
    val version by vm.icons.version.collectAsState()
    val bmp by produceState<ImageBitmap?>(null, item.id, style, version) {
        value = vm.icons.drawableIcon("sc:${item.packageName}:${item.shortcutId}|${item.userSerial}", style) {
            val user = vm.repo.userFor(item.userSerial) ?: return@drawableIcon null
            vm.repo.findShortcut(item.packageName, item.shortcutId, user)?.let { vm.repo.shortcutIcon(it) }
        }
    }
    IconBitmap(bmp, size)
}

/** Label under an icon. On the home screen it adapts to the wallpaper. */
@Composable
fun IconLabel(text: String, onWallpaper: Boolean, modifier: Modifier = Modifier) {
    val cfg = LocalConfig.current
    val wallpaperLight = LocalWallpaperLight.current
    val custom = cfg.icons.labelColor?.let { Color(it) }
    val color = when {
        !onWallpaper -> MaterialTheme.colorScheme.onSurface
        custom != null -> custom
        wallpaperLight -> Color(0xFF1C1B1F)
        else -> Color.White
    }
    val shadow = if (onWallpaper && cfg.home.textShadow && custom == null && !wallpaperLight)
        Shadow(Color.Black.copy(alpha = 0.55f), Offset(0f, 1.5f), 6f) else null
    Text(
        text = text,
        modifier = modifier,
        color = color,
        fontSize = cfg.icons.labelSizeSp.sp,
        maxLines = cfg.icons.labelLines,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.labelMedium.copy(shadow = shadow, fontSize = cfg.icons.labelSizeSp.sp,
            lineHeight = (cfg.icons.labelSizeSp + 3).sp),
    )
}

@Composable
fun BadgeView(count: Int, modifier: Modifier = Modifier) {
    val cfg = LocalConfig.current.badges
    if (!cfg.enabled || count <= 0) return
    val color = cfg.color?.let { Color(it) } ?: MaterialTheme.colorScheme.primary
    val onColor = MaterialTheme.colorScheme.onPrimary
    when (cfg.style) {
        BadgeStyle.DOT -> Box(modifier.size(12.dp).clip(CircleShape).background(color))
        BadgeStyle.COUNT -> Box(
            modifier.sizeIn(minWidth = 18.dp, minHeight = 18.dp).clip(CircleShape).background(color).padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(if (count > 99) "99+" else "$count", color = onColor, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** Icon + optional badge + optional label. */
@Composable
fun Tile(
    iconSize: Dp,
    label: String?,
    onWallpaper: Boolean,
    badge: Int,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
) {
    Column(modifier.padding(vertical = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box {
            icon()
            BadgeView(badge, Modifier.align(Alignment.TopEnd).offset(x = 3.dp, y = (-3).dp))
        }
        if (label != null) {
            Spacer(Modifier.height(4.dp))
            IconLabel(label, onWallpaper, Modifier.padding(horizontal = 2.dp))
        }
    }
}

@Composable
fun AppTile(app: AppInfo, iconSizeDp: Int, showLabel: Boolean, onWallpaper: Boolean, modifier: Modifier = Modifier) {
    val style = rememberIconStyle(iconSizeDp)
    Tile(iconSizeDp.dp, if (showLabel) app.label else null, onWallpaper, LocalBadges.current[app.packageName] ?: 0, modifier) {
        AppIconImage(app, style, iconSizeDp.dp)
    }
}

@Composable
fun FolderTile(folder: FolderItem, iconSizeDp: Int, showLabel: Boolean, onWallpaper: Boolean, modifier: Modifier = Modifier) {
    val vm = LocalVm.current
    val cfg = LocalConfig.current
    val apps by vm.appsByKey.collectAsState()
    val members = folder.apps.mapNotNull { apps[it] }
    val badges = LocalBadges.current
    val badge = members.sumOf { badges[it.packageName] ?: 0 }
    val size = iconSizeDp.dp
    val shape = IconComposeShape(if (cfg.icons.shape == IconShape.SYSTEM) IconShape.SYSTEM else cfg.icons.shape)
    Tile(size, if (showLabel) folder.name else null, onWallpaper, badge, modifier) {
        Box(
            Modifier.size(size).clip(shape)
                .background(MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = cfg.folders.backgroundOpacity * 0.85f)),
            contentAlignment = Alignment.Center,
        ) {
            when (cfg.folders.preview) {
                FolderPreview.FIRST -> members.firstOrNull()?.let {
                    AppIconImage(it, rememberIconStyle((iconSizeDp * 0.7f).toInt()), size * 0.7f)
                }
                FolderPreview.STACK -> {
                    val mini = (iconSizeDp * 0.55f).toInt()
                    val st = rememberIconStyle(mini)
                    members.take(3).reversed().forEachIndexed { i, app ->
                        val shift = (2 - i - (3 - members.take(3).size)) * (iconSizeDp * 0.09f)
                        AppIconImage(app, st, mini.dp, Modifier.offset(x = shift.dp, y = (-shift).dp))
                    }
                }
                FolderPreview.GRID -> {
                    val mini = (iconSizeDp * 0.36f).toInt()
                    val st = rememberIconStyle(mini)
                    Column(verticalArrangement = Arrangement.spacedBy(size * 0.06f)) {
                        members.take(4).chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(size * 0.06f)) {
                                row.forEach { AppIconImage(it, st, mini.dp) }
                                if (row.size == 1) Spacer(Modifier.size(mini.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Gestures

class ItemCallbacks(
    val onTap: (Rect?) -> Unit,
    val onLongPress: () -> Unit,
    /** Null disables dragging (long-press then just opens the menu). */
    val onDragStart: ((Offset) -> Unit)? = null,
    val onDrag: (Offset) -> Unit = {},
    val onDragEnd: () -> Unit = {},
)

/**
 * Tap, long-press (menu on release) and long-press-then-drag in one handler,
 * so it cooperates with the pager and scrolling lists around it.
 * Drag positions are reported in root coordinates.
 */
@Composable
fun Modifier.itemGestures(key: Any?, callbacks: ItemCallbacks): Modifier {
    val holder = remember { arrayOfNulls<LayoutCoordinates>(1) }
    val haptics = LocalHapticFeedback.current
    val hapticsOn = LocalConfig.current.behavior.haptics
    val cb by rememberUpdatedState(callbacks)

    fun bounds(): Rect? = holder[0]?.takeIf { it.isAttached }?.boundsInWindow()?.let {
        Rect(it.left.toInt(), it.top.toInt(), it.right.toInt(), it.bottom.toInt())
    }
    fun toRoot(local: Offset): Offset = holder[0]?.takeIf { it.isAttached }?.localToRoot(local) ?: local

    return this
        .onGloballyPositioned { holder[0] = it }
        .pointerInput(key) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = true)
                // Claim the touch so the home screen's own long-press / double-tap don't also fire.
                // Pagers and lists still scroll: they listen regardless of consumption.
                down.consume()
                val slop = viewConfiguration.touchSlop
                // 0 = undecided, 1 = tap, 2 = cancelled
                var result = 0
                val beforeTimeout = withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
                    while (result == 0) {
                        val ev = awaitPointerEvent()
                        val ch = ev.changes.firstOrNull { it.id == down.id }
                        result = when {
                            ch == null -> 2
                            ch.changedToUp() -> if (ch.isConsumed) 2 else 1
                            ch.isConsumed || ev.changes.size > 1 -> 2
                            (ch.position - down.position).getDistance() > slop -> 2
                            else -> 0
                        }
                    }
                    result
                }
                when (beforeTimeout) {
                    1 -> { cb.onTap(bounds()); return@awaitEachGesture }
                    2 -> return@awaitEachGesture
                }
                // Long press reached.
                if (hapticsOn) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                var dragging = false
                while (true) {
                    val ev = awaitPointerEvent()
                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                    if (!ch.pressed) { ch.consume(); break }
                    ch.consume()
                    val start = cb.onDragStart
                    if (!dragging && start != null && (ch.position - down.position).getDistance() > slop) {
                        dragging = true
                        start(toRoot(ch.position))
                    }
                    if (dragging) cb.onDrag(toRoot(ch.position))
                }
                if (dragging) cb.onDragEnd() else cb.onLongPress()
            }
        }
}
