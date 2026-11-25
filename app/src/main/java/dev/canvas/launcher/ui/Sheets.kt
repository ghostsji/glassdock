package dev.canvas.launcher.ui

import android.appwidget.AppWidgetProviderInfo
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AddToHomeScreen
import androidx.compose.material.icons.outlined.CallSplit
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.Wallpaper
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap
import dev.canvas.launcher.apps.IconPack
import dev.canvas.launcher.data.FolderItem
import dev.canvas.launcher.data.IconRef
import dev.canvas.launcher.data.LayoutOps
import dev.canvas.launcher.data.WidgetItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LauncherSheets(vm: LauncherViewModel, host: LauncherHost) {
    val ui = vm.ui
    val sheet = ui.sheet ?: return
    fun close() { ui.sheet = null }

    // A fresh sheet per kind, so switching (e.g. home menu -> widget picker) animates properly.
    key(sheet::class) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = sheet is Sheet.WidgetPicker)
    ModalBottomSheet(onDismissRequest = ::close, sheetState = state) {
        Column(Modifier.navigationBarsPadding().padding(bottom = 12.dp)) {
            when (sheet) {
                is Sheet.AppMenu -> AppMenu(vm, host, sheet, ::close)
                is Sheet.FolderMenu -> FolderMenu(vm, sheet.itemId, ::close)
                is Sheet.WidgetMenu -> WidgetMenu(vm, host, sheet.itemId, ::close)
                is Sheet.ShortcutMenu -> Actions(listOf(
                    MenuAction("Remove", Icons.Outlined.Close) { vm.removeItem(sheet.itemId); close() },
                ))
                Sheet.HomeMenu -> HomeMenu(vm, host, ::close)
                Sheet.WidgetPicker -> WidgetPicker(vm, host, ::close)
            }
        }
    }
    }
}

private class MenuAction(val label: String, val icon: ImageVector, val onClick: () -> Unit)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Actions(actions: List<MenuAction>) {
    FlowRow(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        maxItemsInEachRow = 4,
    ) {
        actions.forEach { a ->
            Column(
                Modifier.width(84.dp).clip(MaterialTheme.shapes.medium).clickable(onClick = a.onClick).padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer),
                    contentAlignment = Alignment.Center,
                ) { Icon(a.icon, null, tint = MaterialTheme.colorScheme.onSecondaryContainer) }
                Spacer(Modifier.height(6.dp))
                Text(a.label, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, maxLines = 2)
            }
        }
    }
}

@Composable
private fun AppMenu(vm: LauncherViewModel, host: LauncherHost, sheet: Sheet.AppMenu, close: () -> Unit) {
    val app = sheet.app
    val ui = vm.ui
    val prefs by vm.prefs.collectAsState()
    val hidden = app.key in prefs.hidden
    val shortcuts = remember(app.key) { vm.repo.shortcutsFor(app.raw) }

    Row(Modifier.padding(horizontal = 24.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        AppIconImage(app, rememberIconStyle(48), 48.dp)
        Spacer(Modifier.width(16.dp))
        Column {
            Text(app.label, style = MaterialTheme.typography.titleLarge)
            Text(
                app.packageName + if (app.raw.isWork) " · Work" else "",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    shortcuts.forEach { sc -> ShortcutRow(vm, app, sc, close) }
    if (shortcuts.isNotEmpty()) HorizontalDivider(Modifier.padding(vertical = 6.dp))

    val actions = buildList {
        when {
            sheet.homeItemId != null -> add(MenuAction("Remove", Icons.Outlined.Close) { vm.removeItem(sheet.homeItemId); close() })
            sheet.folderId != null -> add(MenuAction("Take out of folder", Icons.Outlined.CallSplit) {
                vm.removeFromFolder(sheet.folderId, app.key); vm.addToHome(app.key); close()
            })
            else -> add(MenuAction("Add to home", Icons.Outlined.AddToHomeScreen) {
                vm.addToHome(app.key); close(); ui.drawerOpen = false; ui.searchOpen = false
            })
        }
        add(MenuAction("Rename", Icons.Outlined.Edit) { ui.dialog = Dialog.RenameApp(app); close() })
        add(MenuAction("Change icon", Icons.Outlined.Palette) { ui.dialog = Dialog.IconPicker(app); close() })
        add(MenuAction(if (hidden) "Unhide" else "Hide", if (hidden) Icons.Outlined.Visibility else Icons.Outlined.VisibilityOff) {
            vm.setHidden(app.key, !hidden); close()
        })
        add(MenuAction("App info", Icons.Outlined.Info) { vm.repo.openAppInfo(app.raw); close() })
        add(MenuAction("Uninstall", Icons.Outlined.Delete) { host.startSafely(vm.repo.uninstallIntent(app.raw)); close() })
    }
    Actions(actions)
}

@Composable
private fun ShortcutRow(vm: LauncherViewModel, app: AppInfo, sc: ShortcutInfo, close: () -> Unit) {
    val style = rememberIconStyle(32)
    val icon by produceState<ImageBitmap?>(null, sc.id) {
        value = vm.icons.drawableIcon("sc:${sc.`package`}:${sc.id}|${app.raw.userSerial}", style) { vm.repo.shortcutIcon(sc) }
    }
    ListItem(
        headlineContent = { Text((sc.shortLabel ?: sc.longLabel ?: sc.id).toString(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = { IconBitmap(icon, 32.dp) },
        trailingContent = {
            IconButton(onClick = { vm.pinShortcut(app, sc); close() }) { Icon(Icons.Outlined.PushPin, "Pin to home screen") }
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable {
            vm.repo.startShortcut(sc.`package`, sc.id, app.raw.user)
            close()
        }.padding(horizontal = 8.dp),
    )
}

@Composable
private fun FolderMenu(vm: LauncherViewModel, itemId: String, close: () -> Unit) {
    val folder = LayoutOps.find(vm.layout.value, itemId) as? FolderItem ?: return
    Text(folder.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
    Actions(listOf(
        MenuAction("Rename", Icons.Outlined.Edit) { vm.ui.dialog = Dialog.RenameFolder(folder.id, folder.name); close() },
        MenuAction("Ungroup", Icons.Outlined.CallSplit) { vm.ungroupFolder(folder.id); close() },
        MenuAction("Remove", Icons.Outlined.Close) { vm.removeItem(folder.id); close() },
    ))
}

@Composable
private fun WidgetMenu(vm: LauncherViewModel, host: LauncherHost, itemId: String, close: () -> Unit) {
    val item = LayoutOps.find(vm.layout.value, itemId) as? WidgetItem ?: return
    val info = remember(item.widgetId) { vm.widgets.info(item.widgetId) }
    val ctx = LocalContext.current
    Text(
        info?.loadLabel(ctx.packageManager) ?: "Widget",
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
    )
    Actions(buildList {
        add(MenuAction("Resize & move", Icons.Outlined.Tune) { vm.ui.dialog = Dialog.AdjustWidget(itemId); close() })
        if (info?.configure != null) add(MenuAction("Settings", Icons.Outlined.Settings) { host.reconfigureWidget(item.widgetId); close() })
        add(MenuAction("Remove", Icons.Outlined.Close) { vm.removeItem(itemId); close() })
    })
}

@Composable
private fun HomeMenu(vm: LauncherViewModel, host: LauncherHost, close: () -> Unit) {
    val ui = vm.ui
    val cfg = LocalConfig.current
    val layout by vm.layout.collectAsState()
    val pageEmpty = layout.pages.getOrNull(ui.currentPage)?.items?.isEmpty() == true
    Actions(buildList {
        add(MenuAction("Wallpaper", Icons.Outlined.Wallpaper) { host.openWallpaperPicker(); close() })
        add(MenuAction("Widgets", Icons.Outlined.Widgets) { ui.sheet = Sheet.WidgetPicker })
        add(MenuAction("Canvas settings", Icons.Outlined.Settings) { host.openSettings(); close() })
        add(MenuAction("Search", Icons.Outlined.Search) { close(); ui.searchOpen = true })
        add(MenuAction("Add page", Icons.Outlined.Add) { vm.addPage(); close() })
        if (pageEmpty && layout.pages.size > 1) add(MenuAction("Remove page", Icons.Outlined.DeleteSweep) { vm.removePage(ui.currentPage); close() })
        add(MenuAction(
            if (cfg.home.lockLayout) "Unlock layout" else "Lock layout",
            if (cfg.home.lockLayout) Icons.Outlined.LockOpen else Icons.Outlined.Lock,
        ) { vm.toggleLock(); close() })
    })
}

@Composable
private fun WidgetPicker(vm: LauncherViewModel, host: LauncherHost, close: () -> Unit) {
    val ctx = LocalContext.current
    val cfg = LocalConfig.current
    val apps by vm.apps.collectAsState()
    var query by remember { mutableStateOf("") }
    val providers by produceState<List<AppWidgetProviderInfo>?>(null) {
        value = withContext(Dispatchers.IO) { vm.widgets.providers() }
    }
    val grouped = remember(providers, query, apps) {
        providers.orEmpty()
            .map { it to (apps.firstOrNull { a -> a.packageName == it.provider.packageName }?.label ?: it.provider.packageName) }
            .filter { (info, appLabel) ->
                query.isBlank() || appLabel.contains(query, true) || info.loadLabel(ctx.packageManager).contains(query, true)
            }
            .groupBy({ it.second }, { it.first })
            .toSortedMap(String.CASE_INSENSITIVE_ORDER)
    }

    Text("Widgets", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(horizontal = 24.dp))
    OutlinedTextField(
        value = query, onValueChange = { query = it }, singleLine = true,
        placeholder = { Text("Search widgets") }, leadingIcon = { Icon(Icons.Outlined.Search, null) },
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    )
    if (providers == null) {
        Text("Loading…", Modifier.padding(24.dp))
        return
    }
    LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(0.85f)) {
        grouped.forEach { (appLabel, infos) ->
            item(key = "h:$appLabel") {
                Text(appLabel, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(start = 24.dp, top = 14.dp, bottom = 4.dp))
            }
            items(infos, key = { it.provider.flattenToString() + it.profile.hashCode() }) { info ->
                val preview by produceState<ImageBitmap?>(null, info.provider) {
                    value = withContext(Dispatchers.IO) {
                        val dpi = ctx.resources.displayMetrics.densityDpi
                        runCatching {
                            (info.loadPreviewImage(ctx, dpi) ?: info.loadIcon(ctx, dpi))?.let { d ->
                                val w = d.intrinsicWidth.coerceIn(1, 600)
                                val h = d.intrinsicHeight.coerceIn(1, 600)
                                d.toBitmap(w, h).asImageBitmap()
                            }
                        }.getOrNull()
                    }
                }
                val (sw, sh) = remember(info) { vm.widgets.spanFor(info, cfg.home.columns, cfg.home.rows) }
                Row(
                    Modifier.fillMaxWidth().clickable { host.addWidget(info); close() }.padding(horizontal = 24.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(120.dp, 80.dp).clip(MaterialTheme.shapes.medium)
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest),
                        contentAlignment = Alignment.Center,
                    ) {
                        preview?.let { Image(it, null, Modifier.padding(6.dp), contentScale = ContentScale.Fit) }
                    }
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(info.loadLabel(ctx.packageManager), style = MaterialTheme.typography.bodyLarge)
                        Text("$sw × $sh", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- Dialogs

@Composable
fun LauncherDialogs(vm: LauncherViewModel) {
    val ui = vm.ui
    when (val d = ui.dialog) {
        null -> {}
        is Dialog.RenameApp -> TextInputDialog(
            title = "Rename app",
            initial = d.app.label,
            onDismiss = { ui.dialog = null },
            onSave = { vm.renameApp(d.app.key, it); ui.dialog = null },
            onReset = { vm.renameApp(d.app.key, null); ui.dialog = null },
        )
        is Dialog.RenameFolder -> TextInputDialog(
            title = "Rename folder",
            initial = d.current,
            onDismiss = { ui.dialog = null },
            onSave = { vm.renameFolder(d.itemId, it); ui.dialog = null },
        )
        is Dialog.IconPicker -> IconPickerDialog(vm, d.app) { ui.dialog = null }
        is Dialog.AdjustWidget -> AdjustWidgetDialog(vm, d.itemId) { ui.dialog = null }
    }
}

@Composable
private fun TextInputDialog(
    title: String,
    initial: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    onReset: (() -> Unit)? = null,
) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(text, { text = it }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
        confirmButton = { TextButton(onClick = { onSave(text) }) { Text("Save") } },
        dismissButton = {
            Row {
                if (onReset != null) TextButton(onClick = onReset) { Text("Reset") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

@Composable
private fun IconPickerDialog(vm: LauncherViewModel, app: AppInfo, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val packs = remember { IconPack.installed(ctx) }
    var selected by remember { mutableStateOf(packs.firstOrNull()?.packageName) }
    var query by remember { mutableStateOf("") }
    val pack by produceState<IconPack?>(null, selected) {
        value = selected?.let { pkg -> withContext(Dispatchers.IO) { IconPack.get(ctx, pkg) } }
    }
    val names = remember(pack, query) {
        val all = pack?.allDrawables.orEmpty()
        val guess = normalizeForSearch(app.label).replace(" ", "_")
        val q = query.trim().lowercase()
        if (q.isNotEmpty()) all.filter { it.contains(q) }
        else all.sortedByDescending { if (it.contains(guess) || guess.contains(it)) 1 else 0 }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Icon for ${app.label}") },
        text = {
            Column {
                if (packs.isEmpty()) {
                    Text("No icon packs installed. Any pack made for Nova, ADW or similar launchers works with Canvas.")
                    TextButton(onClick = {
                        runCatching {
                            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=icon%20pack"))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        }
                    }) { Text("Find icon packs") }
                } else {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        packs.take(3).forEach { p ->
                            FilterChip(selected = selected == p.packageName, onClick = { selected = p.packageName },
                                label = { Text(p.label, maxLines = 1, overflow = TextOverflow.Ellipsis) })
                        }
                    }
                    OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text("Search icons") },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp))
                    val p = pack
                    LazyVerticalGrid(GridCells.Adaptive(56.dp), Modifier.height(320.dp)) {
                        items(names, key = { it }) { name ->
                            val bmp by produceState<ImageBitmap?>(null, p, name) {
                                value = withContext(Dispatchers.IO) {
                                    p?.load(name, ctx.resources.displayMetrics.densityDpi)?.toBitmap(128, 128)?.asImageBitmap()
                                }
                            }
                            Box(
                                Modifier.size(56.dp).clip(MaterialTheme.shapes.small).clickable {
                                    selected?.let { vm.setIcon(app.key, IconRef(it, name)) }
                                    onDismiss()
                                },
                                contentAlignment = Alignment.Center,
                            ) { bmp?.let { Image(it, name, Modifier.size(44.dp)) } }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        dismissButton = { TextButton(onClick = { vm.setIcon(app.key, null); onDismiss() }) { Text("Use default") } },
    )
}

@Composable
private fun AdjustWidgetDialog(vm: LauncherViewModel, itemId: String, onDismiss: () -> Unit) {
    val cfg = LocalConfig.current
    val item = LayoutOps.find(vm.layout.value, itemId) as? WidgetItem
    if (item == null) { onDismiss(); return }
    var x by remember { mutableIntStateOf(item.x) }
    var y by remember { mutableIntStateOf(item.y) }
    var w by remember { mutableIntStateOf(item.spanX) }
    var h by remember { mutableIntStateOf(item.spanY) }
    var error by remember { mutableStateOf(false) }

    @Composable
    fun Stepper(label: String, value: Int, min: Int, max: Int, set: (Int) -> Unit) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, Modifier.weight(1f))
            TextButton(onClick = { set((value - 1).coerceAtLeast(min)); error = false }) { Text("−") }
            Text("$value", Modifier.width(28.dp), textAlign = TextAlign.Center)
            TextButton(onClick = { set((value + 1).coerceAtMost(max)); error = false }) { Text("+") }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Resize & move widget") },
        text = {
            Column {
                Stepper("Width", w, 1, cfg.home.columns) { w = it }
                Stepper("Height", h, 1, cfg.home.rows) { h = it }
                Stepper("Column", x + 1, 1, cfg.home.columns) { x = it - 1 }
                Stepper("Row", y + 1, 1, cfg.home.rows) { y = it - 1 }
                if (error) Text("That overlaps something or goes off the page.", color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = { if (vm.setWidgetGeometry(itemId, x, y, w, h)) onDismiss() else error = true }) { Text("Apply") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
