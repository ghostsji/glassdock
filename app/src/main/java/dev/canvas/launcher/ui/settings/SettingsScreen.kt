package dev.canvas.launcher.ui.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Dock
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Gesture
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableIntState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import dev.canvas.launcher.Features
import dev.canvas.launcher.apps.IconComposeShape
import dev.canvas.launcher.apps.IconPack
import dev.canvas.launcher.data.AccentSource
import dev.canvas.launcher.data.ActionType
import dev.canvas.launcher.data.BadgeStyle
import dev.canvas.launcher.data.ClockStyle
import dev.canvas.launcher.data.DockBackground
import dev.canvas.launcher.data.DrawerStyle
import dev.canvas.launcher.data.FolderPreview
import dev.canvas.launcher.data.FontChoice
import dev.canvas.launcher.data.GestureBinding
import dev.canvas.launcher.data.HomeLayout
import dev.canvas.launcher.data.IconShape
import dev.canvas.launcher.data.LauncherConfig
import dev.canvas.launcher.data.LayoutOps
import dev.canvas.launcher.data.OrientationMode
import dev.canvas.launcher.data.PageIndicator
import dev.canvas.launcher.data.Presets
import dev.canvas.launcher.data.SearchBarPosition
import dev.canvas.launcher.data.SearchEngine
import dev.canvas.launcher.data.SortMode
import dev.canvas.launcher.data.TextAlign3
import dev.canvas.launcher.data.ThemeMode
import dev.canvas.launcher.data.TimeFormat
import dev.canvas.launcher.data.WidgetItem
import dev.canvas.launcher.system.Badges
import dev.canvas.launcher.system.LauncherAccessibilityService
import dev.canvas.launcher.ui.AppTile
import dev.canvas.launcher.ui.CanvasTheme
import dev.canvas.launcher.ui.LauncherViewModel
import dev.canvas.launcher.ui.LocalBadges
import dev.canvas.launcher.ui.LocalConfig
import dev.canvas.launcher.ui.LocalIconOverrides
import dev.canvas.launcher.ui.LocalVm

interface SettingsHost {
    val resumeTick: MutableIntState
    fun isDefaultLauncher(): Boolean
    fun requestDefaultLauncher()
    fun open(intent: Intent)
    fun goHome()
}

private enum class Page(val title: String) {
    MAIN("Canvas"), PRESETS("Presets"), THEME("Theme & colours"), HOME("Home screen"), DOCK("Dock"),
    ICONS("Icons & labels"), DRAWER("App drawer"), FOLDERS("Folders"), GESTURES("Gestures"),
    SEARCH("Search"), BADGES("Notification badges"), HIDDEN("Hidden apps"), BEHAVIOR("Behaviour"),
    BACKUP("Backup & restore"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(vm: LauncherViewModel, host: SettingsHost) {
    val cfg by vm.config.collectAsState()
    val prefs by vm.prefs.collectAsState()
    var page by rememberSaveable { mutableStateOf(Page.MAIN) }
    BackHandler(enabled = page != Page.MAIN) { page = Page.MAIN }

    CanvasTheme(cfg.theme) {
        CompositionLocalProvider(
            LocalVm provides vm,
            LocalConfig provides cfg,
            LocalIconOverrides provides prefs.icons,
            LocalBadges provides emptyMap(),
        ) {
            val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(rememberTopAppBarState())
            Scaffold(
                modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
                topBar = {
                    LargeTopAppBar(
                        title = { Text(page.title) },
                        navigationIcon = {
                            if (page != Page.MAIN) IconButton(onClick = { page = Page.MAIN }) {
                                Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back")
                            }
                        },
                        scrollBehavior = scroll,
                    )
                },
            ) { padding ->
                val update: ((LauncherConfig) -> LauncherConfig) -> Unit = { vm.store.updateConfig(it) }
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding() + 32.dp),
                ) {
                    when (page) {
                        Page.MAIN -> mainPage(host) { page = it }
                        Page.PRESETS -> item { PresetsPage(vm) }
                        Page.THEME -> themePage(cfg, update)
                        Page.HOME -> homePage(cfg, update)
                        Page.DOCK -> dockPage(cfg, update)
                        Page.ICONS -> item { IconsPage(vm, cfg, update) }
                        Page.DRAWER -> drawerPage(cfg, update)
                        Page.FOLDERS -> foldersPage(cfg, update)
                        Page.GESTURES -> item { GesturesPage(vm, host, cfg, update) }
                        Page.SEARCH -> item { SearchPage(cfg, update) }
                        Page.BADGES -> item { BadgesPage(host, cfg, update) }
                        Page.HIDDEN -> hiddenPage(vm)
                        Page.BEHAVIOR -> behaviorPage(cfg, update)
                        Page.BACKUP -> item { BackupPage(vm) }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Main

private fun LazyListScope.mainPage(host: SettingsHost, go: (Page) -> Unit) {
    item { SetupCard(host) }
    item { SectionHeader("Make it yours") }
    item { NavRow("Presets", "One-tap looks: Minimal, Large & easy, Power user…", Icons.Outlined.AutoAwesome) { go(Page.PRESETS) } }
    item { NavRow("Theme & colours", "Dark mode, accent colour, font, roundness", Icons.Outlined.Palette) { go(Page.THEME) } }
    item { NavRow("Home screen", "Grid size, clock, search bar, page dots", Icons.Outlined.Home) { go(Page.HOME) } }
    item { NavRow("Dock", "Slots, style, transparency", Icons.Outlined.Dock) { go(Page.DOCK) } }
    item { NavRow("Icons & labels", "Shape, size, icon packs, themed icons", Icons.Outlined.GridView) { go(Page.ICONS) } }
    item { NavRow("App drawer", "Grid, list or text; sorting; fast scroller", Icons.Outlined.Apps) { go(Page.DRAWER) } }
    item { NavRow("Folders", "Preview style, columns", Icons.Outlined.Folder) { go(Page.FOLDERS) } }
    item { SectionHeader("How it works") }
    item { NavRow("Gestures", "Swipes, double tap, home button", Icons.Outlined.Gesture) { go(Page.GESTURES) } }
    item { NavRow("Search", "Apps, contacts, calculator, web engine", Icons.Outlined.Search) { go(Page.SEARCH) } }
    item {
        NavRow("Notification badges", if (Features.full) "Dots or counts on icons" else "Canvas Full only",
            Icons.Outlined.NotificationsActive) { go(Page.BADGES) }
    }
    item { NavRow("Hidden apps", "Keep apps out of the drawer", Icons.Outlined.VisibilityOff) { go(Page.HIDDEN) } }
    item { NavRow("Behaviour", "Haptics, animation speed, rotation", Icons.Outlined.Speed) { go(Page.BEHAVIOR) } }
    item { NavRow("Backup & restore", "Export, import, share your setup", Icons.Outlined.Backup) { go(Page.BACKUP) } }
    item { VersionText() }
}

@Composable
private fun VersionText() {
    val ctx = LocalContext.current
    val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "" }
    Text(
        "Canvas $version · made to be yours",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun SetupCard(host: SettingsHost) {
    val ctx = LocalContext.current
    val tick = host.resumeTick.intValue
    val isDefault = remember(tick) { host.isDefaultLauncher() }
    val a11y = !Features.full || remember(tick) { LauncherAccessibilityService.isEnabled(ctx) }
    val badges = !Features.full || remember(tick) { Badges.hasAccess(ctx) }
    if (isDefault && a11y && badges) return

    Card(
        Modifier.fillMaxWidth().padding(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Column(Modifier.padding(vertical = 12.dp)) {
            Text("Finish setting up", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            SetupStep("Make Canvas your home screen", "Required", isDefault) { host.requestDefaultLauncher() }
            if (Features.full) {
                SetupStep("Turn on Canvas gestures", "Optional: double-tap to lock, recents, power menu", a11y) {
                    host.open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                }
                SetupStep("Allow notification badges", "Optional: dots and counts on icons", badges) {
                    host.open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                }
            }
            if (isDefault) TextButton(onClick = host::goHome, modifier = Modifier.padding(horizontal = 12.dp)) { Text("Go to home screen") }
        }
    }
}

@Composable
private fun SetupStep(title: String, subtitle: String, done: Boolean, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(if (done) "Done" else subtitle) },
        leadingContent = {
            Icon(if (done) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null,
                tint = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onPrimaryContainer)
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(enabled = !done, onClick = onClick).padding(horizontal = 4.dp),
    )
}

// ---------------------------------------------------------------- Presets

@Composable
private fun PresetsPage(vm: LauncherViewModel) {
    var confirm by remember { mutableStateOf<Int?>(null) }
    Column {
        Text(
            "Presets change looks and behaviour only. Your apps, folders, widgets and renames stay put.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
        Presets.all.forEachIndexed { i, p ->
            Card(
                onClick = { confirm = i },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text(p.name, style = MaterialTheme.typography.titleMedium)
                    Text(p.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
    confirm?.let { i ->
        val p = Presets.all[i]
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Apply \"${p.name}\"?") },
            text = { Text("This replaces your current look settings. You can export a backup first if you want to come back to them.") },
            confirmButton = { TextButton(onClick = { vm.store.updateConfig { p.apply(it) }; confirm = null }) { Text("Apply") } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
}

// ---------------------------------------------------------------- Theme

private typealias Update = ((LauncherConfig) -> LauncherConfig) -> Unit

private fun LazyListScope.themePage(cfg: LauncherConfig, update: Update) {
    val t = cfg.theme
    fun set(f: (dev.canvas.launcher.data.ThemeConfig) -> dev.canvas.launcher.data.ThemeConfig) = update { it.copy(theme = f(it.theme)) }
    item { ChoiceRow("Theme", t.mode, ThemeMode.entries) { v -> set { it.copy(mode = v) } } }
    item {
        val options = if (Build.VERSION.SDK_INT >= 31) AccentSource.entries else listOf(AccentSource.CUSTOM)
        ChoiceRow("Accent colour source", if (Build.VERSION.SDK_INT >= 31) t.accentSource else AccentSource.CUSTOM, options) { v -> set { it.copy(accentSource = v) } }
    }
    if (t.accentSource == AccentSource.CUSTOM || Build.VERSION.SDK_INT < 31) item {
        ColorRow("Accent colour", t.customAccent, allowAuto = false) { c -> if (c != null) set { it.copy(customAccent = c) } }
    }
    item { ChoiceRow("Font", t.font, FontChoice.entries) { v -> set { it.copy(font = v) } } }
    item { SliderRow("Text size", t.fontScale, 0.8f..1.6f, steps = 7) { v -> set { it.copy(fontScale = v) } } }
    item { IntSliderRow("Corner roundness", t.cornerRadius, 0..40, "dp") { v -> set { it.copy(cornerRadius = v) } } }
    item { SwitchRow("High contrast text", "Pure black or white text everywhere", t.highContrast) { v -> set { it.copy(highContrast = v) } } }
}

// ---------------------------------------------------------------- Home

private fun LazyListScope.homePage(cfg: LauncherConfig, update: Update) {
    val h = cfg.home
    fun set(f: (dev.canvas.launcher.data.HomeConfig) -> dev.canvas.launcher.data.HomeConfig) = update { it.copy(home = f(it.home)) }
    item { SectionHeader("Grid") }
    item { IntSliderRow("Columns", h.columns, 3..8) { v -> set { it.copy(columns = v) } } }
    item { IntSliderRow("Rows", h.rows, 3..10) { v -> set { it.copy(rows = v) } } }
    item { IntSliderRow("Side margin", h.sidePaddingDp, 0..40, "dp") { v -> set { it.copy(sidePaddingDp = v) } } }
    item { SwitchRow("Lock layout", "Stops icons being dragged by accident", h.lockLayout) { v -> set { it.copy(lockLayout = v) } } }
    item { SectionHeader("Clock & search") }
    item { ChoiceRow("Clock style", h.clockStyle, ClockStyle.entries) { v -> set { it.copy(clockStyle = v) } } }
    item { ChoiceRow("Clock alignment", h.clockAlign, TextAlign3.entries) { v -> set { it.copy(clockAlign = v) } } }
    item { ChoiceRow("Time format", h.timeFormat, TimeFormat.entries) { v -> set { it.copy(timeFormat = v) } } }
    item { SwitchRow("Show date", null, h.showDate) { v -> set { it.copy(showDate = v) } } }
    item { ChoiceRow("Search bar", h.searchBar, SearchBarPosition.entries) { v -> set { it.copy(searchBar = v) } } }
    item { SectionHeader("Look") }
    item { ChoiceRow("Page indicator", h.pageIndicator, PageIndicator.entries) { v -> set { it.copy(pageIndicator = v) } } }
    item { SliderRow("Dim wallpaper", h.wallpaperDim, 0f..0.8f) { v -> set { it.copy(wallpaperDim = v) } } }
    item { SwitchRow("Text shadow", "Keeps labels readable on busy wallpapers", h.textShadow) { v -> set { it.copy(textShadow = v) } } }
    item { SwitchRow("Hide status bar", "Swipe down from the top to peek", h.hideStatusBar) { v -> set { it.copy(hideStatusBar = v) } } }
}

private fun LazyListScope.dockPage(cfg: LauncherConfig, update: Update) {
    val d = cfg.dock
    fun set(f: (dev.canvas.launcher.data.DockConfig) -> dev.canvas.launcher.data.DockConfig) = update { it.copy(dock = f(it.dock)) }
    item { SwitchRow("Show dock", null, d.enabled) { v -> set { it.copy(enabled = v) } } }
    item { IntSliderRow("Slots", d.slots, 3..7) { v -> set { it.copy(slots = v) } } }
    item { ChoiceRow("Background", d.background, DockBackground.entries) { v -> set { it.copy(background = v) } } }
    item { SliderRow("Background opacity", d.opacity, 0f..1f) { v -> set { it.copy(opacity = v) } } }
    item { SwitchRow("Labels in dock", null, d.showLabels) { v -> set { it.copy(showLabels = v) } } }
}

// ---------------------------------------------------------------- Icons

@Composable
private fun IconsPage(vm: LauncherViewModel, cfg: LauncherConfig, update: Update) {
    val i = cfg.icons
    val ctx = LocalContext.current
    fun set(f: (dev.canvas.launcher.data.IconConfig) -> dev.canvas.launcher.data.IconConfig) = update { it.copy(icons = f(it.icons)) }
    val apps by vm.drawerApps.collectAsState()
    val packs = remember { IconPack.installed(ctx) }
    var packDialog by remember { mutableStateOf(false) }

    Column {
        // Live preview
        Card(
            Modifier.fillMaxWidth().padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest),
        ) {
            Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                apps.take(4).forEach { AppTile(it, i.sizeDp.coerceAtMost(72), i.showLabels, onWallpaper = false, modifier = Modifier.width(76.dp)) }
            }
        }

        SectionHeader("Shape")
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(IconShape.entries) { shape ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { set { it.copy(shape = shape) } }) {
                    Box(
                        Modifier.size(52.dp).clip(IconComposeShape(shape))
                            .background(if (shape == i.shape) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(shape.label, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        Text(
            "Shapes apply to modern (adaptive) icons. Icons from icon packs keep their own shape.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 6.dp),
        )

        SectionHeader("Style")
        IntSliderRow("Icon size", i.sizeDp, 36..88, "dp") { v -> set { it.copy(sizeDp = v) } }
        ListItem(
            headlineContent = { Text("Icon pack") },
            supportingContent = { Text(packs.firstOrNull { it.packageName == i.iconPack }?.label ?: if (packs.isEmpty()) "None installed" else "None") },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.clickable { packDialog = true }.padding(horizontal = 8.dp),
        )
        SwitchRow(
            "Themed icons",
            if (Build.VERSION.SDK_INT >= 33) "Tint icons to match your colours (apps that support it)" else "Needs Android 13 or newer",
            i.themedIcons, enabled = Build.VERSION.SDK_INT >= 33,
        ) { v -> set { it.copy(themedIcons = v) } }
        SwitchRow("Shape old-style icons", "Place pre-Android-8 icons on a shaped background", i.legacyIconBackground) { v ->
            set { it.copy(legacyIconBackground = v) }
        }

        SectionHeader("Labels")
        SwitchRow("Show labels on home screen", null, i.showLabels) { v -> set { it.copy(showLabels = v) } }
        IntSliderRow("Label size", i.labelSizeSp, 8..20, "sp") { v -> set { it.copy(labelSizeSp = v) } }
        IntSliderRow("Label lines", i.labelLines, 1..2) { v -> set { it.copy(labelLines = v) } }
        ColorRow("Label colour", i.labelColor, allowAuto = true, autoLabel = "Match wallpaper") { c -> set { it.copy(labelColor = c) } }
    }

    if (packDialog) {
        val labels = listOf("None (app icons)") + packs.map { it.label }
        val selected = packs.indexOfFirst { it.packageName == i.iconPack } + 1
        ChoiceDialog("Icon pack", labels, selected, { packDialog = false }) { idx ->
            set { it.copy(iconPack = if (idx == 0) null else packs[idx - 1].packageName) }
            vm.icons.invalidateAll()
            packDialog = false
        }
    }
}

// ---------------------------------------------------------------- Drawer / folders

private fun LazyListScope.drawerPage(cfg: LauncherConfig, update: Update) {
    val d = cfg.drawer
    fun set(f: (dev.canvas.launcher.data.DrawerConfig) -> dev.canvas.launcher.data.DrawerConfig) = update { it.copy(drawer = f(it.drawer)) }
    item { ChoiceRow("Layout", d.style, DrawerStyle.entries) { v -> set { it.copy(style = v) } } }
    if (d.style == DrawerStyle.GRID) item { IntSliderRow("Columns", d.columns, 3..7) { v -> set { it.copy(columns = v) } } }
    item { ChoiceRow("Sort apps by", d.sort, SortMode.entries) { v -> set { it.copy(sort = v) } } }
    item { SliderRow("Background opacity", d.backgroundOpacity, 0.3f..1f) { v -> set { it.copy(backgroundOpacity = v) } } }
    item { SwitchRow("Search bar", null, d.showSearch) { v -> set { it.copy(showSearch = v) } } }
    item { SwitchRow("Open keyboard automatically", "Start typing as soon as the drawer opens", d.autoKeyboard) { v -> set { it.copy(autoKeyboard = v) } } }
    item { SwitchRow("A–Z fast scroller", "When sorted alphabetically", d.fastScroller) { v -> set { it.copy(fastScroller = v) } } }
    item { SwitchRow("Suggested apps", "Your most-used apps at the top", d.showSuggestions) { v -> set { it.copy(showSuggestions = v) } } }
    item { SwitchRow("Labels", null, d.showLabels) { v -> set { it.copy(showLabels = v) } } }
}

private fun LazyListScope.foldersPage(cfg: LauncherConfig, update: Update) {
    val f = cfg.folders
    fun set(t: (dev.canvas.launcher.data.FolderConfig) -> dev.canvas.launcher.data.FolderConfig) = update { it.copy(folders = t(it.folders)) }
    item {
        Text(
            "Make a folder by dragging one app onto another.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
    }
    item { ChoiceRow("Folder icon", f.preview, FolderPreview.entries) { v -> set { it.copy(preview = v) } } }
    item { IntSliderRow("Columns inside folders", f.columns, 3..6) { v -> set { it.copy(columns = v) } } }
    item { SliderRow("Background opacity", f.backgroundOpacity, 0.3f..1f) { v -> set { it.copy(backgroundOpacity = v) } } }
}

// ---------------------------------------------------------------- Gestures

@Composable
private fun GesturesPage(vm: LauncherViewModel, host: SettingsHost, cfg: LauncherConfig, update: Update) {
    val g = cfg.gestures
    val ctx = LocalContext.current
    val tick = host.resumeTick.intValue
    val a11y = remember(tick) { LauncherAccessibilityService.isEnabled(ctx) }
    fun set(f: (dev.canvas.launcher.data.GestureConfig) -> dev.canvas.launcher.data.GestureConfig) = update { it.copy(gestures = f(it.gestures)) }

    Column {
        if (!Features.full) {
            Text(
                "Lock screen, recent apps, power menu and screenshot gestures are in Canvas Full, which has to be installed from a computer. Everything else works here.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )
        } else if (!a11y) {
            Card(
                Modifier.fillMaxWidth().padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text("Lock screen, recent apps, power menu and screenshot need the \"Canvas gestures\" accessibility service. It doesn't read anything on your screen.",
                        style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { host.open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }) { Text("Open accessibility settings") }
                }
            }
        }
        SectionHeader("Swipes")
        GestureRow(vm, "Swipe up", g.swipeUp) { b -> set { it.copy(swipeUp = b) } }
        if (g.swipeUp.action == ActionType.OPEN_DRAWER) {
            SwitchRow("Drawer follows your finger", "Drag the app drawer up instead of it popping open", g.swipeUpFollowsFinger) { v ->
                set { it.copy(swipeUpFollowsFinger = v) }
            }
        }
        GestureRow(vm, "Swipe down", g.swipeDown) { b -> set { it.copy(swipeDown = b) } }
        GestureRow(vm, "Two-finger swipe up", g.twoFingerSwipeUp) { b -> set { it.copy(twoFingerSwipeUp = b) } }
        GestureRow(vm, "Two-finger swipe down", g.twoFingerSwipeDown) { b -> set { it.copy(twoFingerSwipeDown = b) } }
        SectionHeader("Taps & presses")
        GestureRow(vm, "Double tap", g.doubleTap) { b -> set { it.copy(doubleTap = b) } }
        GestureRow(vm, "Two-finger double tap", g.twoFingerDoubleTap) { b -> set { it.copy(twoFingerDoubleTap = b) } }
        GestureRow(vm, "Long-press empty space", g.longPress) { b -> set { it.copy(longPress = b) } }
        SectionHeader("Pinch")
        GestureRow(vm, "Pinch in", g.pinchIn) { b -> set { it.copy(pinchIn = b) } }
        GestureRow(vm, "Pinch out", g.pinchOut) { b -> set { it.copy(pinchOut = b) } }
        SectionHeader("Buttons & clock")
        GestureRow(vm, "Home button (while on home)", g.homeButton) { b -> set { it.copy(homeButton = b) } }
        GestureRow(vm, "Tap the time", g.clockTap) { b -> set { it.copy(clockTap = b) } }
        GestureRow(vm, "Tap the date", g.dateTap) { b -> set { it.copy(dateTap = b) } }
        if (g.longPress.action != ActionType.HOME_MENU && g.pinchIn.action != ActionType.HOME_MENU) {
            Text(
                "Tip: the home screen menu (widgets, wallpaper, pages) isn't on any gesture right now. Canvas Settings is still in your app list.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun GestureRow(vm: LauncherViewModel, title: String, binding: GestureBinding, onChange: (GestureBinding) -> Unit) {
    val apps by vm.drawerApps.collectAsState()
    var pickAction by remember { mutableStateOf(false) }
    var pickApp by remember { mutableStateOf(false) }
    val summary = when (binding.action) {
        ActionType.LAUNCH_APP -> "Open " + (apps.firstOrNull { it.key == binding.appKey }?.label ?: "an app")
        else -> binding.action.label + if (!Features.available(binding.action)) " (Canvas Full only)" else ""
    }
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(summary) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable { pickAction = true }.padding(horizontal = 8.dp),
    )
    if (pickAction) {
        ActionPickerDialog(title, binding.action, { pickAction = false }) { action ->
            pickAction = false
            if (action == ActionType.LAUNCH_APP) pickApp = true else onChange(GestureBinding(action))
        }
    }
    if (pickApp) {
        ChoiceDialog("Choose an app", apps.map { it.label }, apps.indexOfFirst { it.key == binding.appKey }, { pickApp = false }) { i ->
            onChange(GestureBinding(ActionType.LAUNCH_APP, apps[i].key)); pickApp = false
        }
    }
}

/** Every action, grouped by category, with a search box. */
@Composable
private fun ActionPickerDialog(title: String, current: ActionType, onDismiss: () -> Unit, onPick: (ActionType) -> Unit) {
    var query by remember { mutableStateOf("") }
    val groups = remember(query) {
        ActionType.entries
            .filter { Features.available(it) || it == current }
            .filter { query.isBlank() || it.label.contains(query.trim(), ignoreCase = true) }
            .groupBy { it.category }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, singleLine = true,
                    placeholder = { Text("Search actions") }, leadingIcon = { Icon(Icons.Outlined.Search, null) },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
                LazyColumn(Modifier.height(420.dp)) {
                    groups.forEach { (category, actions) ->
                        item(key = "h:" + category.name) {
                            Text(
                                category.title, style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
                            )
                        }
                        items(actions, key = { it.name }) { action ->
                            Row(
                                Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small)
                                    .clickable { onPick(action) }.padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RadioButton(selected = action == current, onClick = null)
                                Spacer(Modifier.width(12.dp))
                                Text(action.label)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ---------------------------------------------------------------- Search

@Composable
private fun SearchPage(cfg: LauncherConfig, update: Update) {
    val s = cfg.search
    val ctx = LocalContext.current
    fun set(f: (dev.canvas.launcher.data.SearchConfig) -> dev.canvas.launcher.data.SearchConfig) = update { it.copy(search = f(it.search)) }
    val askContacts = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        set { it.copy(contacts = granted) }
        if (!granted) Toast.makeText(ctx, "Contacts permission denied", Toast.LENGTH_SHORT).show()
    }
    Column {
        SectionHeader("Search in")
        SwitchRow("Apps", null, s.apps) { v -> set { it.copy(apps = v) } }
        SwitchRow("Contacts", "Read only while you search, never stored", s.contacts) { v ->
            val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
            if (v && !granted) askContacts.launch(Manifest.permission.READ_CONTACTS) else set { it.copy(contacts = v) }
        }
        SwitchRow("App shortcuts", "e.g. \"new tab\", \"compose\", \"directions home\"", s.shortcuts) { v -> set { it.copy(shortcuts = v) } }
        SwitchRow("Calculator", "Type sums like 12*4+7", s.calculator) { v -> set { it.copy(calculator = v) } }
        SwitchRow("Web search", null, s.web) { v -> set { it.copy(web = v) } }
        ChoiceRow("Search engine", s.engine, SearchEngine.entries) { v -> set { it.copy(engine = v) } }
        SectionHeader("Matching")
        SwitchRow("Fuzzy matching", "\"gm\" finds Google Maps, typos still match", s.fuzzy) { v -> set { it.copy(fuzzy = v) } }
        SwitchRow("Enter opens top result", null, s.launchOnEnter) { v -> set { it.copy(launchOnEnter = v) } }
        SwitchRow("Include hidden apps", "Hidden apps still show up when you search", s.includeHidden) { v -> set { it.copy(includeHidden = v) } }
    }
}

// ---------------------------------------------------------------- Badges

@Composable
private fun BadgesPage(host: SettingsHost, cfg: LauncherConfig, update: Update) {
    val b = cfg.badges
    val ctx = LocalContext.current
    val tick = host.resumeTick.intValue
    val access = remember(tick) { Badges.hasAccess(ctx) }
    fun set(f: (dev.canvas.launcher.data.BadgeConfig) -> dev.canvas.launcher.data.BadgeConfig) = update { it.copy(badges = f(it.badges)) }
    if (!Features.full) {
        Text(
            "Notification badges need notification access, which Android only allows for Canvas Full (installed from a computer). This is Canvas Lite.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(24.dp),
        )
        return
    }
    Column {
        if (!access) {
            Card(Modifier.fillMaxWidth().padding(16.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Badges need notification access. Canvas only counts notifications per app; it never reads or keeps their content.",
                        style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { host.open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }) { Text("Grant access") }
                }
            }
        }
        SwitchRow("Show badges", null, b.enabled) { v ->
            set { it.copy(enabled = v) }
            if (v && !access) host.open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        ChoiceRow("Badge style", b.style, BadgeStyle.entries) { v -> set { it.copy(style = v) } }
        ColorRow("Badge colour", b.color, allowAuto = true, autoLabel = "Accent colour") { c -> set { it.copy(color = c) } }
    }
}

// ---------------------------------------------------------------- Hidden apps

private fun LazyListScope.hiddenPage(vm: LauncherViewModel) {
    item {
        Text(
            "Hidden apps don't appear in the drawer. They still work, and can still be found by search if you allow it.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
    }
    item { HiddenList(vm) }
}

@Composable
private fun HiddenList(vm: LauncherViewModel) {
    val apps by vm.apps.collectAsState()
    val prefs by vm.prefs.collectAsState()
    Column {
        apps.forEach { app ->
            val hidden = app.key in prefs.hidden
            ListItem(
                headlineContent = { Text(app.label) },
                supportingContent = if (app.raw.isWork) { { Text("Work profile") } } else null,
                leadingContent = { dev.canvas.launcher.ui.AppIconImage(app, dev.canvas.launcher.ui.rememberIconStyle(40), 40.dp) },
                trailingContent = { Switch(checked = hidden, onCheckedChange = { vm.setHidden(app.key, it) }) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.clickable { vm.setHidden(app.key, !hidden) }.padding(horizontal = 8.dp),
            )
        }
    }
}

// ---------------------------------------------------------------- Behaviour

private fun LazyListScope.behaviorPage(cfg: LauncherConfig, update: Update) {
    val b = cfg.behavior
    fun set(f: (dev.canvas.launcher.data.BehaviorConfig) -> dev.canvas.launcher.data.BehaviorConfig) = update { it.copy(behavior = f(it.behavior)) }
    item { SwitchRow("Haptic feedback", null, b.haptics) { v -> set { it.copy(haptics = v) } } }
    item { SliderRow("Animation speed", b.animationSpeed, 0.5f..2f, steps = 5, format = { "×%.2f".format(it) }) { v -> set { it.copy(animationSpeed = v) } } }
    item { ChoiceRow("Rotation", b.orientation, OrientationMode.entries) { v -> set { it.copy(orientation = v) } } }
    item { SwitchRow("Close drawer after opening an app", null, b.closeDrawerOnLaunch) { v -> set { it.copy(closeDrawerOnLaunch = v) } } }
}

// ---------------------------------------------------------------- Backup

@Composable
private fun BackupPage(vm: LauncherViewModel) {
    val ctx = LocalContext.current
    var includeLayout by remember { mutableStateOf(true) }
    var confirmReset by remember { mutableStateOf<String?>(null) }

    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching {
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(vm.store.exportJson(includeLayout).toByteArray()) }
        }.onSuccess { Toast.makeText(ctx, "Backup saved", Toast.LENGTH_SHORT).show() }
            .onFailure { Toast.makeText(ctx, "Couldn't save: ${it.message}", Toast.LENGTH_LONG).show() }
    }
    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val text = runCatching { ctx.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } }.getOrNull()
        val error = if (text == null) "Couldn't read that file" else vm.store.importJson(text)
        Toast.makeText(ctx, error ?: "Setup restored", Toast.LENGTH_SHORT).show()
        vm.icons.invalidateAll()
    }

    Column(Modifier.padding(horizontal = 8.dp)) {
        Text(
            "A backup is a small JSON file. Share it with a friend and they get your exact look.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(16.dp),
        )
        SwitchRow("Include home screen layout", "Apps, folders and hidden apps — not widgets", includeLayout) { includeLayout = it }
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { exporter.launch("canvas-backup.json") }, modifier = Modifier.weight(1f)) { Text("Export") }
            OutlinedButton(onClick = { importer.launch(arrayOf("application/json", "text/plain", "*/*")) }, modifier = Modifier.weight(1f)) { Text("Import") }
        }
        SectionHeader("Reset")
        NavRow("Reset look to default", "Keeps your layout and apps", null) { confirmReset = "look" }
        NavRow("Clear home screen", "Removes every icon, folder and widget", null) { confirmReset = "layout" }
    }

    confirmReset?.let { what ->
        AlertDialog(
            onDismissRequest = { confirmReset = null },
            title = { Text(if (what == "look") "Reset look?" else "Clear home screen?") },
            text = { Text("This can't be undone, unless you've exported a backup.") },
            confirmButton = {
                TextButton(onClick = {
                    if (what == "look") vm.store.resetConfig()
                    else {
                        LayoutOps.allItems(vm.layout.value).filterIsInstance<WidgetItem>().forEach { vm.widgets.delete(it.widgetId) }
                        vm.store.updateLayout { HomeLayout() }
                    }
                    confirmReset = null
                }) { Text(if (what == "look") "Reset" else "Clear") }
            },
            dismissButton = { TextButton(onClick = { confirmReset = null }) { Text("Cancel") } },
        )
    }
}
