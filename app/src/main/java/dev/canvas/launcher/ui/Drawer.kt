package dev.canvas.launcher.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.canvas.launcher.data.AppItem
import dev.canvas.launcher.data.DrawerStyle
import dev.canvas.launcher.data.SortMode
import kotlinx.coroutines.launch

@Composable
fun AppDrawer(vm: LauncherViewModel, host: LauncherHost, geometry: DropGeometry, modifier: Modifier = Modifier) {
    val cfg = LocalConfig.current
    val d = cfg.drawer
    val ui = vm.ui
    val apps by vm.drawerApps.collectAsState()
    val suggestions by vm.suggestions.collectAsState()
    var query by remember { mutableStateOf("") }
    var profile by remember { mutableIntStateOf(0) } // 0 all, 1 personal, 2 work
    val hasWork = remember(apps) { apps.any { it.raw.isWork } }
    val keyboard = LocalSoftwareKeyboardController.current
    val density = LocalDensity.current
    val closeThreshold = with(density) { 90.dp.toPx() }

    val filtered = remember(apps, query, profile, cfg.search.fuzzy) {
        apps.filter { profile == 0 || (profile == 2) == it.raw.isWork }
            .let { list ->
                if (query.isBlank()) list
                else list.map { it to matchScore(it.label, query, cfg.search.fuzzy) }
                    .filter { it.second > 0 }
                    .sortedByDescending { it.second }
                    .map { it.first }
            }
    }

    fun launch(app: AppInfo, bounds: android.graphics.Rect?) {
        vm.launch(app, bounds, host.rootView)
        keyboard?.hide()
        if (cfg.behavior.closeDrawerOnLaunch) ui.drawerOpen = false
    }

    // Pulling down when the list is already at the top closes the drawer.
    val closeOnPull = remember {
        object : NestedScrollConnection {
            var pulled = 0f
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                if (source == NestedScrollSource.UserInput && available.y > 0f) {
                    pulled += available.y
                    if (pulled > closeThreshold) { pulled = 0f; ui.drawerOpen = false }
                } else if (consumed.y != 0f) pulled = 0f
                return Offset.Zero
            }
            override suspend fun onPreFling(available: Velocity): Velocity { pulled = 0f; return Velocity.Zero }
        }
    }

    Surface(modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface.copy(alpha = d.backgroundOpacity)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            // Header (also a drag handle: pull it down to close).
            Column(
                Modifier.fillMaxWidth().pointerInput(Unit) {
                    var total = 0f
                    detectVerticalDragGestures(
                        onDragStart = { total = 0f },
                        onVerticalDrag = { _, dy -> total += dy },
                        onDragEnd = { if (total > closeThreshold * 0.7f) ui.drawerOpen = false },
                    )
                },
            ) {
                Box(Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp).size(36.dp, 4.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)))
                if (d.showSearch) {
                    DrawerSearchField(
                        query = query,
                        onQuery = { query = it },
                        autoFocus = d.autoKeyboard && ui.drawerOpen,
                        onSubmit = { filtered.firstOrNull()?.let { launch(it, null) } },
                        onSettings = { host.openSettings() },
                    )
                }
                if (hasWork) {
                    Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("All", "Personal", "Work").forEachIndexed { i, label ->
                            FilterChip(selected = profile == i, onClick = { profile = i }, label = { Text(label) })
                        }
                    }
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                val gridState = rememberLazyGridState()
                val columns = if (d.style == DrawerStyle.GRID) d.columns else 1
                val showSuggest = d.showSuggestions && query.isBlank() && profile == 0 && suggestions.size >= 3
                val headerItems = if (showSuggest) 3 else 0
                val scroller = d.fastScroller && d.sort == SortMode.ALPHABETICAL && query.isBlank()
                LaunchedEffect(query) { if (filtered.isNotEmpty()) gridState.scrollToItem(0) }

                LazyVerticalGrid(
                    columns = GridCells.Fixed(columns),
                    state = gridState,
                    modifier = Modifier.fillMaxSize().nestedScroll(closeOnPull),
                    contentPadding = PaddingValues(start = 8.dp, end = if (scroller) 30.dp else 8.dp, top = 8.dp, bottom = 24.dp),
                ) {
                    if (showSuggest) {
                        item(span = { GridItemSpan(maxLineSpan) }) { SectionLabel("Suggested") }
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            val n = maxOf(4, d.columns)
                            Row(Modifier.fillMaxWidth()) {
                                suggestions.take(n).forEach { app ->
                                    Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                                        AppTile(
                                            app, cfg.icons.sizeDp, d.showLabels, onWallpaper = false,
                                            modifier = Modifier.drawerGestures(vm, host, geometry, app, ::launch),
                                        )
                                    }
                                }
                                repeat(n - suggestions.take(n).size) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                        item(span = { GridItemSpan(maxLineSpan) }) { SectionLabel("All apps") }
                    }
                    items(filtered, key = { it.key }) { app ->
                        val gestures = Modifier.drawerGestures(vm, host, geometry, app, ::launch)
                        when (d.style) {
                            DrawerStyle.GRID -> Box(Modifier.padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                                AppTile(app, cfg.icons.sizeDp, d.showLabels, onWallpaper = false, modifier = gestures)
                            }
                            DrawerStyle.LIST -> Row(
                                gestures.fillMaxWidth().clip(MaterialTheme.shapes.medium).padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AppIconImage(app, rememberIconStyle(42), 42.dp)
                                Spacer(Modifier.width(16.dp))
                                Text(app.label, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f))
                                BadgeView(LocalBadges.current[app.packageName] ?: 0)
                            }
                            DrawerStyle.TEXT -> Text(
                                app.label,
                                style = MaterialTheme.typography.headlineSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = gestures.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                            )
                        }
                    }
                }

                if (scroller) {
                    val letters = remember(filtered, headerItems) {
                        filtered.mapIndexed { i, app -> sectionOf(app.label) to i + headerItems }
                            .distinctBy { it.first }
                    }
                    if (letters.size > 3) FastScroller(letters, gridState, Modifier.align(Alignment.CenterEnd))
                }
            }
        }
    }
}

private fun sectionOf(label: String): Char {
    val c = normalizeForSearch(label).firstOrNull()?.uppercaseChar() ?: '#'
    return if (c.isLetter()) c else '#'
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun Modifier.drawerGestures(
    vm: LauncherViewModel,
    host: LauncherHost,
    geometry: DropGeometry,
    app: AppInfo,
    launch: (AppInfo, android.graphics.Rect?) -> Unit,
): Modifier {
    val ui = vm.ui
    val locked = LocalConfig.current.home.lockLayout
    return itemGestures(app.key, ItemCallbacks(
        onTap = { b -> launch(app, b) },
        onLongPress = { ui.sheet = Sheet.AppMenu(app) },
        onDragStart = if (locked) null else { p ->
            ui.drawerSuppressed = true
            ui.drag = DragState(AppItem(appKey = app.key), fromDrawer = true, start = p)
        },
        onDrag = { p -> ui.drag?.pointer = p },
        onDragEnd = { finishDrop(vm, host, geometry) },
    ))
}

@Composable
private fun DrawerSearchField(
    query: String,
    onQuery: (String) -> Unit,
    autoFocus: Boolean,
    onSubmit: () -> Unit,
    onSettings: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(autoFocus) { if (autoFocus) runCatching { focus.requestFocus() } }
    TextField(
        value = query,
        onValueChange = onQuery,
        singleLine = true,
        placeholder = { Text("Search apps") },
        leadingIcon = { Icon(Icons.Outlined.Search, null) },
        trailingIcon = {
            if (query.isNotEmpty()) IconButton(onClick = { onQuery("") }) { Icon(Icons.Outlined.Close, "Clear") }
            else IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, "Canvas settings") }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
        keyboardActions = KeyboardActions(onGo = { onSubmit() }),
        shape = CircleShape,
        colors = TextFieldDefaults.colors(
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp).focusRequester(focus),
    )
}

@Composable
private fun FastScroller(letters: List<Pair<Char, Int>>, state: LazyGridState, modifier: Modifier) {
    var active by remember { mutableStateOf<Char?>(null) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val hapticsOn = LocalConfig.current.behavior.haptics

    Box(modifier.fillMaxHeight().padding(vertical = 16.dp)) {
        active?.let { c ->
            Box(
                Modifier.align(Alignment.Center).offset(x = (-64).dp).size(64.dp).clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) { Text(c.toString(), fontSize = 30.sp, color = MaterialTheme.colorScheme.onPrimaryContainer) }
        }
        Column(
            Modifier
                .fillMaxHeight()
                .width(28.dp)
                .pointerInput(letters) {
                    fun pick(y: Float) {
                        val i = (y / size.height * letters.size).toInt().coerceIn(0, letters.lastIndex)
                        val (c, index) = letters[i]
                        if (active != c) {
                            active = c
                            if (hapticsOn) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            scope.launch { state.scrollToItem(index) }
                        }
                    }
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        down.consume()
                        pick(down.position.y)
                        do {
                            val ev = awaitPointerEvent()
                            val ch = ev.changes.firstOrNull { it.id == down.id }
                            ch?.consume()
                            if (ch != null && ch.pressed) pick(ch.position.y)
                        } while (ch != null && ch.pressed)
                        active = null
                    }
                },
            verticalArrangement = Arrangement.SpaceEvenly,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            letters.forEach { (c, _) ->
                Text(
                    c.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (active == c) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
