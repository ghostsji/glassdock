package dev.canvas.launcher.ui

import android.appwidget.AppWidgetProviderInfo
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.text.format.DateFormat
import android.view.View
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import dev.canvas.launcher.data.AppItem
import dev.canvas.launcher.data.ClockStyle
import dev.canvas.launcher.data.DockBackground
import dev.canvas.launcher.data.DropTarget
import dev.canvas.launcher.data.FolderItem
import dev.canvas.launcher.data.GestureBinding
import dev.canvas.launcher.data.ActionType
import dev.canvas.launcher.data.HomeItem
import dev.canvas.launcher.data.HomePage
import dev.canvas.launcher.data.LayoutOps
import dev.canvas.launcher.data.PageIndicator
import dev.canvas.launcher.data.SearchBarPosition
import dev.canvas.launcher.data.ShortcutItem
import dev.canvas.launcher.data.TextAlign3
import dev.canvas.launcher.data.TimeFormat
import dev.canvas.launcher.data.WidgetItem
import dev.canvas.launcher.system.Badges
import dev.canvas.launcher.system.LongPressWidgetView
import kotlinx.coroutines.delay
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs

/** What the Compose UI needs from the Activity. */
interface LauncherHost {
    val rootView: View
    fun perform(binding: GestureBinding)
    fun addWidget(info: AppWidgetProviderInfo)
    fun reconfigureWidget(widgetId: Int)
    fun openWallpaperPicker()
    fun openSettings()
    fun startSafely(intent: Intent)
}

/** Screen-space rectangles used to work out where a dragged item lands. */
class DropGeometry {
    var grid: Rect = Rect.Zero
    var dock: Rect = Rect.Zero
    var dockSlots: Int = 5
    val zones = mutableStateMapOf<String, Rect>()

    fun cellAt(p: Offset, cols: Int, rows: Int): Pair<Int, Int>? {
        if (grid.isEmpty || !grid.contains(p)) return null
        val x = ((p.x - grid.left) / (grid.width / cols)).toInt().coerceIn(0, cols - 1)
        val y = ((p.y - grid.top) / (grid.height / rows)).toInt().coerceIn(0, rows - 1)
        return x to y
    }

    fun dockSlotAt(p: Offset): Int? {
        if (dock.isEmpty || !dock.contains(p)) return null
        return ((p.x - dock.left) / (dock.width / dockSlots)).toInt().coerceIn(0, dockSlots - 1)
    }

    fun zoneAt(p: Offset): String? = zones.entries.firstOrNull { it.value.contains(p) }?.key
}

@Composable
fun LauncherScreen(vm: LauncherViewModel, host: LauncherHost) {
    val cfg by vm.config.collectAsState()
    val prefs by vm.prefs.collectAsState()
    val badges by Badges.counts.collectAsState()
    val wallpaperLight by vm.wallpaperIsLight.collectAsState()
    val ui = vm.ui

    BackHandler { ui.closeTop() }

    CanvasTheme(cfg.theme) {
        CompositionLocalProvider(
            LocalVm provides vm,
            LocalConfig provides cfg,
            LocalIconOverrides provides prefs.icons,
            LocalBadges provides (if (cfg.badges.enabled) badges else emptyMap()),
            LocalWallpaperLight provides wallpaperLight,
        ) {
            val geometry = remember { DropGeometry() }
            val speed = cfg.behavior.animationSpeed.coerceIn(0.25f, 3f)
            val duration = (260 / speed).toInt()

            Box(Modifier.fillMaxSize()) {
                if (cfg.home.wallpaperDim > 0f) {
                    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = cfg.home.wallpaperDim)))
                }

                LaunchedEffect(ui.drawerOpen) { if (ui.drawerOpen) ui.drawerSuppressed = false }
                val homeAlpha by animateFloatAsState(
                    if ((ui.drawerOpen && !ui.drawerSuppressed) || ui.searchOpen) 0f else 1f, tween(duration), label = "home",
                )
                HomeScreen(vm, host, geometry, Modifier.graphicsLayer { alpha = homeAlpha })

                AnimatedVisibility(
                    visible = ui.drawerOpen,
                    enter = slideInVertically(tween(duration)) { it / 4 } + fadeIn(tween(duration)),
                    exit = slideOutVertically(tween(duration)) { it / 4 } + fadeOut(tween(duration)),
                ) {
                    AppDrawer(vm, host, geometry, Modifier.graphicsLayer { alpha = if (ui.drawerSuppressed) 0f else 1f })
                }

                AnimatedVisibility(
                    visible = ui.searchOpen,
                    enter = fadeIn(tween(duration)) + slideInVertically(tween(duration)) { -it / 8 },
                    exit = fadeOut(tween(duration)),
                ) { SearchOverlay(vm, host) }

                AnimatedVisibility(
                    visible = ui.openFolderId != null,
                    enter = fadeIn(tween(duration)) + scaleIn(tween(duration), initialScale = 0.85f),
                    exit = fadeOut(tween(duration)) + scaleOut(tween(duration), targetScale = 0.9f),
                ) {
                    // Keep the last folder while the exit animation runs.
                    var last by remember { mutableStateOf<String?>(null) }
                    ui.openFolderId?.let { last = it }
                    last?.let { FolderOverlay(vm, host, it) }
                }

                ui.drag?.let { DragGhost(it) }
                LauncherSheets(vm, host)
                LauncherDialogs(vm)
            }
        }
    }
}

@Composable
private fun HomeScreen(vm: LauncherViewModel, host: LauncherHost, geometry: DropGeometry, modifier: Modifier) {
    val cfg = LocalConfig.current
    val layout by vm.layout.collectAsState()
    val ui = vm.ui
    val density = LocalDensity.current
    val dragging = ui.drag != null

    val pagerState = rememberPagerState { layout.pages.size + if (dragging) 1 else 0 }
    LaunchedEffect(pagerState) { snapshotFlow { pagerState.currentPage }.collect { ui.currentPage = it } }
    LaunchedEffect(ui.pageRequest) {
        val target = ui.pageRequest ?: return@LaunchedEffect
        delay(16)
        pagerState.animateScrollToPage(target.coerceIn(0, (pagerState.pageCount - 1).coerceAtLeast(0)))
        ui.pageRequest = null
    }

    // While dragging, hovering at a screen edge flips the page.
    val edgePx = with(density) { 28.dp.toPx() }
    val edge by remember {
        derivedStateOf {
            val d = ui.drag ?: return@derivedStateOf 0
            val g = geometry.grid
            when {
                g.isEmpty || d.pointer.y < g.top || d.pointer.y > g.bottom -> 0
                d.pointer.x < g.left + edgePx -> -1
                d.pointer.x > g.right - edgePx -> 1
                else -> 0
            }
        }
    }
    LaunchedEffect(edge) {
        while (edge != 0) {
            delay(550)
            val target = pagerState.currentPage + edge
            if (target !in 0 until pagerState.pageCount) break
            pagerState.animateScrollToPage(target)
        }
    }

    Column(
        modifier
            .fillMaxSize()
            .homeGestures(vm, host)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Header: clock + search, replaced by drop zones while dragging (same space, so nothing jumps).
        Box(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().alpha(if (dragging) 0f else 1f)) {
                Clock(host)
                if (cfg.home.searchBar == SearchBarPosition.TOP) SearchPill { ui.searchOpen = true }
            }
            if (dragging) DropZones(vm, geometry, Modifier.align(Alignment.Center))
        }

        val sidePad = cfg.home.sidePaddingDp.dp
        val sidePadPx = with(density) { sidePad.toPx() }
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .onGloballyPositioned {
                    val b = it.boundsInRoot()
                    geometry.grid = Rect(b.left + sidePadPx, b.top, b.right - sidePadPx, b.bottom)
                },
        ) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
                beyondViewportPageCount = 1,
            ) { index ->
                val page = layout.pages.getOrNull(index) ?: HomePage(id = "new")
                HomePageGrid(vm, host, geometry, page, index, pagerState)
            }
        }

        if (cfg.home.searchBar == SearchBarPosition.BOTTOM) SearchPill { ui.searchOpen = true }
        PageIndicatorView(pagerState)
        if (cfg.dock.enabled) Dock(vm, host, geometry, layout.dock)
    }
}

/** Swipes (one and two fingers), double tap and long-press on empty space. */
@Composable
private fun Modifier.homeGestures(vm: LauncherViewModel, host: LauncherHost): Modifier {
    val cfg = LocalConfig.current
    val gestures by rememberUpdatedState(cfg.gestures)
    val threshold = with(LocalDensity.current) { 64.dp.toPx() }
    return this
        .pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                var maxPointers = 1
                val start = HashMap<Long, Offset>()
                start[down.id.value] = down.position
                val last = HashMap<Long, Offset>(start)
                var consumedVertical = false
                while (true) {
                    val ev = awaitPointerEvent()
                    ev.changes.forEach { c ->
                        if (c.pressed && !start.containsKey(c.id.value)) start[c.id.value] = c.position
                        if (c.pressed) last[c.id.value] = c.position
                        if (c.isConsumed && abs(c.position.y - c.previousPosition.y) > abs(c.position.x - c.previousPosition.x)) consumedVertical = true
                    }
                    maxPointers = maxOf(maxPointers, ev.changes.count { it.pressed })
                    if (ev.changes.none { it.pressed }) break
                }
                if (consumedVertical || vm.ui.drag != null) return@awaitEachGesture
                val dys = start.keys.mapNotNull { id -> last[id]?.let { it.y - start[id]!!.y } }
                val dxs = start.keys.mapNotNull { id -> last[id]?.let { it.x - start[id]!!.x } }
                if (dys.isEmpty()) return@awaitEachGesture
                val dy = dys.average().toFloat()
                val dx = dxs.average().toFloat()
                if (abs(dy) < threshold || abs(dy) < abs(dx) * 1.4f) return@awaitEachGesture
                val binding = if (maxPointers >= 2) {
                    if (dy < 0) gestures.twoFingerSwipeUp else gestures.twoFingerSwipeDown
                } else {
                    if (dy < 0) gestures.swipeUp else gestures.swipeDown
                }
                host.perform(binding)
            }
        }
        .pointerInput(Unit) {
            detectTapGestures(
                onDoubleTap = { host.perform(gestures.doubleTap) },
                onLongPress = { vm.ui.sheet = Sheet.HomeMenu },
            )
        }
}

@Composable
private fun HomePageGrid(
    vm: LauncherViewModel,
    host: LauncherHost,
    geometry: DropGeometry,
    page: HomePage,
    index: Int,
    pagerState: PagerState,
) {
    val cfg = LocalConfig.current
    val ui = vm.ui
    val cols = cfg.home.columns
    val rows = cfg.home.rows
    BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = cfg.home.sidePaddingDp.dp)) {
        val cellW = maxWidth / cols
        val cellH = maxHeight / rows

        // Highlight the cell under a dragged item.
        val drag = ui.drag
        if (drag != null && pagerState.currentPage == index && !pagerState.isScrollInProgress) {
            geometry.cellAt(drag.pointer, cols, rows)?.let { (cx, cy) ->
                Box(
                    Modifier
                        .offset(cellW * cx, cellH * cy)
                        .size(cellW, cellH)
                        .padding(4.dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(Color.White.copy(alpha = 0.18f)),
                )
            }
        }

        if (page.items.isEmpty() && index == 0 && drag == null && vm.layout.value.dock.isEmpty()) {
            Text(
                "Long-press anywhere for widgets & settings.\nSwipe up for all apps.",
                modifier = Modifier.align(Alignment.Center).padding(32.dp),
                color = Color.White.copy(alpha = 0.8f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyMedium.copy(shadow = Shadow(Color.Black.copy(alpha = 0.5f), blurRadius = 6f)),
            )
        }

        page.items.forEach { item ->
            key(item.id) {
                Box(
                    Modifier
                        .offset(cellW * item.x, cellH * item.y)
                        .size(cellW * item.spanX, cellH * item.spanY)
                        .alpha(if (ui.drag?.item?.id == item.id) 0f else 1f),
                    contentAlignment = Alignment.Center,
                ) {
                    HomeItemView(vm, host, geometry, item, showLabel = cfg.icons.showLabels)
                }
            }
        }
    }
}

/** Renders any home-screen item (app, folder, shortcut, widget) with its gestures. */
@Composable
fun HomeItemView(
    vm: LauncherViewModel,
    host: LauncherHost,
    geometry: DropGeometry,
    item: HomeItem,
    showLabel: Boolean,
) {
    val cfg = LocalConfig.current
    val ui = vm.ui
    val appsByKey by vm.appsByKey.collectAsState()
    val iconSize = cfg.icons.sizeDp
    val canDrag = !cfg.home.lockLayout

    fun dragCallbacks(onTap: (android.graphics.Rect?) -> Unit, onLongPress: () -> Unit) = ItemCallbacks(
        onTap = onTap,
        onLongPress = onLongPress,
        onDragStart = if (canDrag) { p -> ui.drag = DragState(item, fromDrawer = false, start = p) } else null,
        onDrag = { p -> ui.drag?.pointer = p },
        onDragEnd = { finishDrop(vm, host, geometry) },
    )

    when (item) {
        is AppItem -> {
            val app = appsByKey[item.appKey] ?: return
            AppTile(
                app, iconSize, showLabel, onWallpaper = true,
                modifier = Modifier.itemGestures(item.id, dragCallbacks(
                    onTap = { b -> vm.launch(app, b, host.rootView) },
                    onLongPress = { ui.sheet = Sheet.AppMenu(app, homeItemId = item.id) },
                )),
            )
        }
        is FolderItem -> FolderTile(
            item, iconSize, showLabel, onWallpaper = true,
            modifier = Modifier.itemGestures(item.id, dragCallbacks(
                onTap = { ui.openFolderId = item.id },
                onLongPress = { ui.sheet = Sheet.FolderMenu(item.id) },
            )),
        )
        is ShortcutItem -> {
            val style = rememberIconStyle(iconSize)
            Tile(
                iconSize.dp, if (showLabel) item.label else null, onWallpaper = true, badge = 0,
                modifier = Modifier.itemGestures(item.id, dragCallbacks(
                    onTap = { b -> vm.launchShortcut(item, b) },
                    onLongPress = { ui.sheet = Sheet.ShortcutMenu(item.id) },
                )),
            ) { ShortcutIconImage(item, style, iconSize.dp) }
        }
        is WidgetItem -> WidgetView(vm, item) { ui.sheet = Sheet.WidgetMenu(item.id) }
    }
}

@Composable
private fun WidgetView(vm: LauncherViewModel, item: WidgetItem, onLongPress: () -> Unit) {
    val cb by rememberUpdatedState(onLongPress)
    val available = remember(item.widgetId) { vm.widgets.info(item.widgetId) != null }
    BoxWithConstraints(Modifier.fillMaxSize().padding(4.dp)) {
        if (!available) {
            Box(
                Modifier.fillMaxSize().clip(MaterialTheme.shapes.large)
                    .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.7f))
                    .itemGestures(item.id, ItemCallbacks(onTap = {}, onLongPress = { cb() })),
                contentAlignment = Alignment.Center,
            ) { Text("Widget unavailable\nLong-press to remove", textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall) }
            return@BoxWithConstraints
        }
        val w = maxWidth.value
        val h = maxHeight.value
        AndroidView<View>(
            factory = { ctx -> vm.widgets.createView(ctx, item.widgetId) ?: View(ctx) },
            update = { v ->
                if (v is LongPressWidgetView) {
                    v.onLongPress = { cb() }
                    vm.widgets.updateSize(v, w, h)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun Dock(vm: LauncherViewModel, host: LauncherHost, geometry: DropGeometry, items: List<HomeItem>) {
    val cfg = LocalConfig.current
    val ui = vm.ui
    val slots = cfg.dock.slots
    val bg = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = cfg.dock.opacity)
    val shape = when (cfg.dock.background) {
        DockBackground.PILL -> RoundedCornerShape(cfg.theme.cornerRadius.dp + 8.dp)
        else -> RoundedCornerShape(0.dp)
    }
    val outer = if (cfg.dock.background == DockBackground.PILL) Modifier.padding(horizontal = 12.dp, vertical = 8.dp) else Modifier
    Box(
        outer
            .fillMaxWidth()
            .clip(shape)
            .then(if (cfg.dock.background != DockBackground.NONE) Modifier.background(bg) else Modifier)
            .onGloballyPositioned { geometry.dock = it.boundsInRoot(); geometry.dockSlots = slots }
            .padding(vertical = 10.dp, horizontal = 6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            val hover = ui.drag?.let { geometry.dockSlotAt(it.pointer) }
            for (slot in 0 until slots) {
                Box(
                    Modifier
                        .weight(1f)
                        .height((cfg.icons.sizeDp + if (cfg.dock.showLabels) 24 else 6).dp)
                        .clip(MaterialTheme.shapes.medium)
                        .background(if (hover == slot) Color.White.copy(alpha = 0.18f) else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    items.firstOrNull { it.x == slot }?.let { item ->
                        Box(Modifier.alpha(if (ui.drag?.item?.id == item.id) 0f else 1f)) {
                            HomeItemView(vm, host, geometry, item, showLabel = cfg.dock.showLabels)
                        }
                    }
                }
            }
        }
    }
}

/** Finishes a drag: works out the target from the pointer position and applies it. */
fun finishDrop(vm: LauncherViewModel, host: LauncherHost, geometry: DropGeometry) {
    val ui = vm.ui
    val d = ui.drag ?: return
    ui.drag = null
    val cfg = vm.config.value
    val p = d.pointer
    val app = (d.item as? AppItem)?.let { vm.appsByKey.value[it.appKey] }

    when (geometry.zoneAt(p)) {
        "remove" -> if (!d.fromDrawer) vm.removeItem(d.item.id)
        "info" -> app?.let { vm.repo.openAppInfo(it.raw) }
        "uninstall" -> app?.let { host.startSafely(vm.repo.uninstallIntent(it.raw)) }
        else -> {
            val slot = if (cfg.dock.enabled) geometry.dockSlotAt(p) else null
            val cell = geometry.cellAt(p, cfg.home.columns, cfg.home.rows)
            when {
                slot != null -> vm.drop(d.item, DropTarget.Dock(slot))
                cell != null -> vm.drop(d.item, DropTarget.Page(ui.currentPage, cell.first, cell.second))
            }
        }
    }
    geometry.zones.clear()
    if (d.fromDrawer) ui.drawerOpen = false
}

@Composable
private fun DropZones(vm: LauncherViewModel, geometry: DropGeometry, modifier: Modifier) {
    val d = vm.ui.drag ?: return
    val isApp = d.item is AppItem
    val hover = geometry.zoneAt(d.pointer)
    Row(modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)) {
        if (!d.fromDrawer) DropZone("remove", "Remove", Icons.Outlined.Close, hover, geometry)
        if (isApp) DropZone("info", "App info", Icons.Outlined.Info, hover, geometry)
        if (isApp) DropZone("uninstall", "Uninstall", Icons.Outlined.Delete, hover, geometry)
    }
}

@Composable
private fun DropZone(id: String, label: String, icon: ImageVector, hover: String?, geometry: DropGeometry) {
    val active = hover == id
    val scale by animateFloatAsState(if (active) 1.1f else 1f, label = "zone")
    Surface(
        shape = CircleShape,
        color = if (active) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.92f),
        modifier = Modifier.scale(scale).onGloballyPositioned { geometry.zones[id] = it.boundsInRoot() },
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(label, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun DragGhost(drag: DragState) {
    val vm = LocalVm.current
    val cfg = LocalConfig.current
    val size = cfg.icons.sizeDp
    val half = with(LocalDensity.current) { (size.dp / 2).toPx() }
    val appsByKey by vm.appsByKey.collectAsState()
    Box(
        Modifier
            .graphicsLayer {
                translationX = drag.pointer.x - half
                translationY = drag.pointer.y - half
                scaleX = 1.12f; scaleY = 1.12f
                alpha = 0.92f
            },
    ) {
        when (val item = drag.item) {
            is AppItem -> appsByKey[item.appKey]?.let { AppIconImage(it, rememberIconStyle(size), size.dp) }
            is FolderItem -> FolderTile(item, size, showLabel = false, onWallpaper = true)
            is ShortcutItem -> ShortcutIconImage(item, rememberIconStyle(size), size.dp)
            is WidgetItem -> {}
        }
    }
}

// ---------------------------------------------------------------- Header pieces

@Composable
private fun wallpaperTextColor(): Color {
    val custom = LocalConfig.current.icons.labelColor
    return when {
        custom != null -> Color(custom)
        LocalWallpaperLight.current -> Color(0xFF1C1B1F)
        else -> Color.White
    }
}

@Composable
private fun Clock(host: LauncherHost) {
    val cfg = LocalConfig.current
    val style = cfg.home.clockStyle
    if (style == ClockStyle.HIDDEN) { Spacer(Modifier.height(16.dp)); return }
    val ctx = LocalContext.current

    var now by remember { mutableStateOf(LocalDateTime.now()) }
    DisposableEffect(Unit) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) { now = LocalDateTime.now() }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_TIME_TICK); addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED); addAction(Intent.ACTION_SCREEN_ON)
        }
        ContextCompat.registerReceiver(ctx, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        now = LocalDateTime.now()
        onDispose { ctx.unregisterReceiver(receiver) }
    }

    val is24 = when (cfg.home.timeFormat) {
        TimeFormat.SYSTEM -> DateFormat.is24HourFormat(ctx)
        TimeFormat.H24 -> true
        TimeFormat.H12 -> false
    }
    val color = wallpaperTextColor()
    val shadow = if (cfg.home.textShadow && color == Color.White) Shadow(Color.Black.copy(alpha = 0.45f), Offset(0f, 2f), 10f) else null
    val align = when (cfg.home.clockAlign) {
        TextAlign3.START -> Alignment.Start
        TextAlign3.CENTER -> Alignment.CenterHorizontally
        TextAlign3.END -> Alignment.End
    }
    val textAlign = when (cfg.home.clockAlign) {
        TextAlign3.START -> TextAlign.Start
        TextAlign3.CENTER -> TextAlign.Center
        TextAlign3.END -> TextAlign.End
    }
    val time = now.format(DateTimeFormatter.ofPattern(if (is24) "HH:mm" else "h:mm"))
    val date = now.format(DateTimeFormatter.ofPattern("EEEE, d MMMM"))

    val onTime = {
        if (cfg.gestures.clockTap.action == ActionType.NONE) host.startSafely(Intent(AlarmClock.ACTION_SHOW_ALARMS))
        else host.perform(cfg.gestures.clockTap)
    }
    val onDate = {
        val millis = now.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val uri = CalendarContract.CONTENT_URI.buildUpon().appendPath("time").let { ContentUris.appendId(it, millis) }.build()
        host.startSafely(Intent(Intent.ACTION_VIEW, uri))
    }
    val noRipple = remember { MutableInteractionSource() }
    val family = MaterialTheme.typography.displayLarge.fontFamily
    fun Modifier.tap(f: () -> Unit) = clickable(noRipple, null) { f() }
    fun base(size: Int, weight: FontWeight) = TextStyle(
        color = color, fontSize = size.sp, fontWeight = weight, shadow = shadow, textAlign = textAlign,
        fontFamily = family, lineHeight = (size * 1.05f).sp,
    )

    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp), horizontalAlignment = align) {
        when (style) {
            ClockStyle.LARGE -> {
                Text(time, style = base(68, FontWeight.Light), modifier = Modifier.tap(onTime))
                if (cfg.home.showDate) Text(date, style = base(17, FontWeight.Medium), modifier = Modifier.tap(onDate))
            }
            ClockStyle.STACKED -> {
                val parts = time.split(":")
                Column(Modifier.tap(onTime), horizontalAlignment = align) {
                    Text(parts[0].padStart(2, '0'), style = base(96, FontWeight.Bold))
                    Text(parts.getOrElse(1) { "" }, style = base(96, FontWeight.Thin))
                }
                if (cfg.home.showDate) Text(date.uppercase(), style = base(14, FontWeight.Medium).copy(letterSpacing = 3.sp), modifier = Modifier.tap(onDate))
            }
            ClockStyle.SMALL -> Row(verticalAlignment = Alignment.Bottom) {
                Text(time, style = base(32, FontWeight.Normal), modifier = Modifier.tap(onTime))
                if (cfg.home.showDate) {
                    Spacer(Modifier.width(12.dp))
                    Text(date, style = base(15, FontWeight.Medium), modifier = Modifier.padding(bottom = 5.dp).tap(onDate))
                }
            }
            ClockStyle.MINIMAL -> {
                Text(time, style = base(44, FontWeight.ExtraLight), modifier = Modifier.tap(onTime))
                if (cfg.home.showDate) Text(date.lowercase(), style = base(14, FontWeight.Light), modifier = Modifier.tap(onDate))
            }
            ClockStyle.HIDDEN -> {}
        }
    }
}

@Composable
fun SearchPill(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.92f),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp).height(50.dp),
    ) {
        Row(Modifier.padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Search, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Text("Search apps, contacts & web", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PageIndicatorView(state: PagerState) {
    val cfg = LocalConfig.current
    val count = state.pageCount
    if (cfg.home.pageIndicator == PageIndicator.NONE || count <= 1) { Spacer(Modifier.height(8.dp)); return }
    val color = wallpaperTextColor()
    Box(Modifier.fillMaxWidth().height(20.dp), contentAlignment = Alignment.Center) {
        when (cfg.home.pageIndicator) {
            PageIndicator.DOTS -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(count) { i ->
                    val active = state.currentPage == i
                    val w by animateFloatAsState(if (active) 18f else 6f, label = "dot")
                    Box(Modifier.size(w.dp, 6.dp).clip(CircleShape).background(color.copy(alpha = if (active) 0.95f else 0.45f)))
                }
            }
            PageIndicator.LINE -> Box(Modifier.width(96.dp).height(3.dp).clip(CircleShape).background(color.copy(alpha = 0.3f))) {
                val seg = 96f / count
                val pos = (state.currentPage + state.currentPageOffsetFraction) * seg
                Box(Modifier.offset(x = pos.dp).width(seg.dp).height(3.dp).clip(CircleShape).background(color))
            }
            PageIndicator.NUMBER -> Text("${state.currentPage + 1} / $count", color = color, style = MaterialTheme.typography.labelMedium)
            PageIndicator.NONE -> {}
        }
    }
}

// ---------------------------------------------------------------- Folder overlay

@Composable
private fun FolderOverlay(vm: LauncherViewModel, host: LauncherHost, folderId: String) {
    val cfg = LocalConfig.current
    val layout by vm.layout.collectAsState()
    val appsByKey by vm.appsByKey.collectAsState()
    val folder = LayoutOps.find(layout, folderId) as? FolderItem
    val ui = vm.ui
    if (folder == null) { LaunchedEffect(Unit) { ui.openFolderId = null }; return }
    val members = folder.apps.mapNotNull { appsByKey[it] }
    val noRipple = remember { MutableInteractionSource() }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.4f)).clickable(noRipple, null) { ui.openFolderId = null },
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surfaceContainer.copy(alpha = cfg.folders.backgroundOpacity),
            modifier = Modifier.padding(24.dp).widthIn(max = 440.dp).pointerInput(Unit) { detectTapGestures { } },
        ) {
            Column(Modifier.padding(20.dp)) {
                Text(
                    folder.name,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.fillMaxWidth().clickable { ui.dialog = Dialog.RenameFolder(folder.id, folder.name) }.padding(4.dp),
                    textAlign = TextAlign.Center,
                )
                Text("Tap the name to rename", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                LazyVerticalGrid(GridCells.Fixed(cfg.folders.columns), Modifier.fillMaxWidth().height(
                    (((members.size + cfg.folders.columns - 1) / cfg.folders.columns).coerceIn(1, 4) * (cfg.icons.sizeDp + 40)).dp,
                )) {
                    items(members, key = { it.key }) { app ->
                        AppTile(
                            app, cfg.icons.sizeDp, showLabel = true, onWallpaper = false,
                            modifier = Modifier.padding(4.dp).itemGestures(app.key, ItemCallbacks(
                                onTap = { b -> vm.launch(app, b, host.rootView); ui.openFolderId = null },
                                onLongPress = { ui.sheet = Sheet.AppMenu(app, folderId = folder.id) },
                            )),
                        )
                    }
                }
            }
        }
    }
}
