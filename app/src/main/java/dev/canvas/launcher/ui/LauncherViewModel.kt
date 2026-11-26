package dev.canvas.launcher.ui

import android.app.Application
import android.appwidget.AppWidgetProviderInfo
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.graphics.Rect
import android.provider.MediaStore
import android.view.View
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.canvas.launcher.CanvasApp
import dev.canvas.launcher.apps.RawApp
import dev.canvas.launcher.data.AppItem
import dev.canvas.launcher.data.DropTarget
import dev.canvas.launcher.data.FolderItem
import dev.canvas.launcher.data.HomeItem
import dev.canvas.launcher.data.HomePage
import dev.canvas.launcher.data.IconRef
import dev.canvas.launcher.data.LayoutOps
import dev.canvas.launcher.data.ShortcutItem
import dev.canvas.launcher.data.SortMode
import dev.canvas.launcher.data.WidgetItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.Collator

/** An app as shown to the user (with any custom label applied). */
data class AppInfo(val raw: RawApp, val label: String) {
    val key: String get() = raw.key
    val packageName: String get() = raw.packageName
}

sealed interface Sheet {
    data class AppMenu(val app: AppInfo, val homeItemId: String? = null, val folderId: String? = null) : Sheet
    data class FolderMenu(val itemId: String) : Sheet
    data class WidgetMenu(val itemId: String) : Sheet
    data class ShortcutMenu(val itemId: String) : Sheet
    data object HomeMenu : Sheet
    data object WidgetPicker : Sheet
}

sealed interface Dialog {
    data class RenameApp(val app: AppInfo) : Dialog
    data class RenameFolder(val itemId: String, val current: String) : Dialog
    data class IconPicker(val app: AppInfo) : Dialog
    data class AdjustWidget(val itemId: String) : Dialog
}

class DragState(val item: HomeItem, val fromDrawer: Boolean, start: Offset) {
    var pointer by mutableStateOf(start)
}

/** Transient UI state (what's open right now). */
class UiState {
    var drawerOpen by mutableStateOf(false)
    var searchOpen by mutableStateOf(false)
    var openFolderId by mutableStateOf<String?>(null)
    var sheet by mutableStateOf<Sheet?>(null)
    var dialog by mutableStateOf<Dialog?>(null)
    var drag by mutableStateOf<DragState?>(null)
    /** True from the moment an app is dragged out of the drawer until the drawer has closed. */
    var drawerSuppressed by mutableStateOf(false)
    /** 0 = drawer closed, 1 = fully open. Follows the finger during a swipe-up. */
    val drawerProgress = androidx.compose.animation.core.Animatable(0f)
    /** True while a finger is dragging the drawer open. */
    var drawerDragging by mutableStateOf(false)
    var currentPage by mutableIntStateOf(0)
    var pageRequest by mutableStateOf<Int?>(null)

    /** Closes the top-most thing. Returns false if nothing was open. */
    fun closeTop(): Boolean = when {
        dialog != null -> { dialog = null; true }
        sheet != null -> { sheet = null; true }
        openFolderId != null -> { openFolderId = null; true }
        searchOpen -> { searchOpen = false; true }
        drawerOpen -> { drawerOpen = false; true }
        else -> false
    }

    fun closeAll(): Boolean {
        val any = dialog != null || sheet != null || openFolderId != null || searchOpen || drawerOpen
        dialog = null; sheet = null; openFolderId = null; searchOpen = false; drawerOpen = false; drag = null
        return any
    }
}

class LauncherViewModel(application: Application) : AndroidViewModel(application) {
    private val canvas = application as CanvasApp
    val store = canvas.store
    val repo = canvas.apps
    val icons = canvas.icons
    val widgets = canvas.widgets

    val config = store.config
    val layout = store.layout
    val prefs = store.prefs
    val ui = UiState()
    val wallpaperIsLight = MutableStateFlow(false)

    private val collator = Collator.getInstance().apply { strength = Collator.PRIMARY }

    val apps: StateFlow<List<AppInfo>> = combine(
        repo.apps, prefs.map { it.labels }.distinctUntilChanged(),
    ) { raw, labels ->
        raw.map { AppInfo(it, labels[it.key] ?: it.label) }.sortedWith(compareBy(collator) { it.label })
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val appsByKey: StateFlow<Map<String, AppInfo>> =
        apps.map { list -> list.associateBy { it.key } }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    val drawerApps: StateFlow<List<AppInfo>> = combine(
        apps, prefs, config.map { it.drawer.sort }.distinctUntilChanged(),
    ) { list, p, sort ->
        val visible = list.filter { it.key !in p.hidden }
        when (sort) {
            SortMode.ALPHABETICAL -> visible
            SortMode.MOST_USED -> visible.sortedByDescending { p.launches[it.key] ?: 0 }
            SortMode.RECENTLY_INSTALLED -> visible.sortedByDescending { it.raw.installTime }
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val suggestions: StateFlow<List<AppInfo>> = combine(apps, prefs) { list, p ->
        list.filter { it.key !in p.hidden && (p.launches[it.key] ?: 0) > 0 }
            .sortedByDescending { p.launches[it.key] ?: 0 }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        if (store.isFirstRun) viewModelScope.launch {
            val list = repo.apps.first { it.isNotEmpty() }
            applyFirstRunDock(list)
        }
    }

    private val cols get() = config.value.home.columns
    private val rows get() = config.value.home.rows
    private val dockSlots get() = config.value.dock.slots

    // ---------------------------------------------------------------- Launching

    fun launch(app: AppInfo, bounds: Rect?, view: View?) {
        repo.launch(app.raw, bounds, view)
        store.recordLaunch(app.key)
    }

    fun launchKey(key: String, bounds: Rect? = null, view: View? = null) {
        appsByKey.value[key]?.let { launch(it, bounds, view) }
    }

    fun launchShortcut(item: ShortcutItem, bounds: Rect?) {
        val user = repo.userFor(item.userSerial) ?: return
        repo.startShortcut(item.packageName, item.shortcutId, user, bounds)
    }

    // ---------------------------------------------------------------- Home layout

    fun addToHome(appKey: String) = store.updateLayout {
        LayoutOps.addToHome(it, AppItem(appKey = appKey), cols, rows, ui.currentPage)
    }

    fun isOnHome(appKey: String): Boolean = LayoutOps.allItems(layout.value).any {
        (it is AppItem && it.appKey == appKey) || (it is FolderItem && appKey in it.apps)
    }

    fun drop(item: HomeItem, target: DropTarget) = store.updateLayout {
        LayoutOps.drop(it, item, target, cols, rows, dockSlots)
    }

    fun removeItem(id: String) {
        val item = LayoutOps.find(layout.value, id) ?: return
        store.updateLayout { LayoutOps.remove(it, id) }
        when (item) {
            is WidgetItem -> widgets.delete(item.widgetId)
            is ShortcutItem -> syncPins(item.packageName, item.userSerial)
            else -> {}
        }
    }

    fun addPage() = store.updateLayout { l ->
        val at = (ui.currentPage + 1).coerceAtMost(l.pages.size)
        l.copy(pages = l.pages.toMutableList().apply { add(at, HomePage()) })
    }.also { ui.pageRequest = ui.currentPage + 1 }

    fun removePage(index: Int) = store.updateLayout { l ->
        if (l.pages.size <= 1 || index !in l.pages.indices) l
        else {
            l.pages[index].items.filterIsInstance<WidgetItem>().forEach { widgets.delete(it.widgetId) }
            l.copy(pages = l.pages.filterIndexed { i, _ -> i != index })
        }
    }

    fun renameFolder(id: String, name: String) = store.updateLayout { l ->
        LayoutOps.update(l, id) { (it as? FolderItem)?.copy(name = name.ifBlank { "Folder" }) ?: it }
    }

    fun removeFromFolder(folderId: String, appKey: String) = store.updateLayout {
        LayoutOps.removeFromFolder(it, folderId, appKey)
    }

    /** Replaces a folder by its apps, each placed in the next free cell. */
    fun ungroupFolder(id: String) {
        val folder = LayoutOps.find(layout.value, id) as? FolderItem ?: return
        store.updateLayout { l ->
            var out = LayoutOps.remove(l, id)
            folder.apps.forEach { key -> out = LayoutOps.addToHome(out, AppItem(appKey = key), cols, rows, ui.currentPage) }
            out
        }
    }

    fun toggleLock() = store.updateConfig { it.copy(home = it.home.copy(lockLayout = !it.home.lockLayout)) }

    // ---------------------------------------------------------------- Per-app tweaks

    fun renameApp(key: String, label: String?) = store.updatePrefs {
        it.copy(labels = if (label.isNullOrBlank()) it.labels - key else it.labels + (key to label.trim()))
    }

    fun setHidden(key: String, hidden: Boolean) = store.updatePrefs {
        it.copy(hidden = if (hidden) it.hidden + key else it.hidden - key)
    }

    fun setIcon(key: String, ref: IconRef?) = store.updatePrefs {
        it.copy(icons = if (ref == null) it.icons - key else it.icons + (key to ref))
    }

    // ---------------------------------------------------------------- Shortcuts

    fun pinShortcut(app: AppInfo, s: ShortcutInfo) {
        val item = ShortcutItem(
            packageName = s.`package`, shortcutId = s.id, userSerial = app.raw.userSerial,
            label = (s.shortLabel ?: s.longLabel ?: app.label).toString(),
        )
        store.updateLayout { LayoutOps.addToHome(it, item, cols, rows, ui.currentPage) }
        syncPins(item.packageName, item.userSerial, extra = item.shortcutId)
    }

    private fun syncPins(pkg: String, serial: Long, extra: String? = null) {
        val user = repo.userFor(serial) ?: return
        val ids = LayoutOps.allItems(layout.value)
            .filterIsInstance<ShortcutItem>()
            .filter { it.packageName == pkg && it.userSerial == serial }
            .map { it.shortcutId }
        repo.setPinned(pkg, (ids + listOfNotNull(extra)).distinct(), user)
    }

    // ---------------------------------------------------------------- Widgets

    fun placeWidget(widgetId: Int, info: AppWidgetProviderInfo) {
        val (w, h) = widgets.spanFor(info, cols, rows)
        store.updateLayout {
            LayoutOps.addToHome(it, WidgetItem(widgetId = widgetId, spanX = w, spanY = h), cols, rows, ui.currentPage)
        }
    }

    /** Returns false if the widget wouldn't fit there. */
    fun setWidgetGeometry(id: String, x: Int, y: Int, w: Int, h: Int): Boolean {
        val l = layout.value
        val pageIndex = l.pages.indexOfFirst { p -> p.items.any { it.id == id } }
        if (pageIndex < 0) return false
        if (!LayoutOps.fits(l.pages[pageIndex], x, y, w, h, cols, rows, ignoreId = id)) return false
        store.updateLayout { LayoutOps.update(it, id) { item -> (item as WidgetItem).copy(x = x, y = y, spanX = w, spanY = h) } }
        return true
    }

    // ---------------------------------------------------------------- First run

    private fun applyFirstRunDock(list: List<RawApp>) {
        val pm = getApplication<Application>().packageManager
        fun pkgFor(intent: Intent): String? =
            @Suppress("DEPRECATION")
            pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
                ?.takeIf { it != "android" && !it.contains("resolver") }

        val wanted = listOfNotNull(
            pkgFor(Intent(Intent.ACTION_DIAL)),
            pkgFor(Intent(Intent.ACTION_SENDTO, android.net.Uri.parse("smsto:"))),
            pkgFor(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://example.com"))),
            pkgFor(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)),
        ).distinct()
        val personal = list.filterNot { it.isWork }
        val dockApps = wanted.mapNotNull { pkg -> personal.firstOrNull { it.packageName == pkg } }
            .plus(listOfNotNull(personal.firstOrNull { it.packageName == "com.android.vending" }))
            .distinctBy { it.key }
            .take(dockSlots)

        store.updateLayout { l ->
            if (l.dock.isNotEmpty() || l.pages.any { it.items.isNotEmpty() }) l
            else l.copy(dock = dockApps.mapIndexed { i, app -> AppItem(appKey = app.key, x = i, y = 0) })
        }
    }
}
