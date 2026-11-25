package dev.canvas.launcher.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.UUID

fun newId(): String = UUID.randomUUID().toString()

@Serializable
data class HomeLayout(
    val pages: List<HomePage> = listOf(HomePage()),
    /** Dock items use [HomeItem.x] as the slot index. */
    val dock: List<HomeItem> = emptyList(),
)

@Serializable
data class HomePage(
    val id: String = newId(),
    val items: List<HomeItem> = emptyList(),
)

@Serializable
sealed class HomeItem {
    abstract val id: String
    abstract val x: Int
    abstract val y: Int
    open val spanX: Int get() = 1
    open val spanY: Int get() = 1
    abstract fun at(x: Int, y: Int): HomeItem

    fun covers(cx: Int, cy: Int) = cx in x until x + spanX && cy in y until y + spanY
    fun overlaps(ox: Int, oy: Int, ow: Int, oh: Int) =
        x < ox + ow && ox < x + spanX && y < oy + oh && oy < y + spanY
}

@Serializable
@SerialName("app")
data class AppItem(
    override val id: String = newId(),
    override val x: Int = 0,
    override val y: Int = 0,
    val appKey: String,
) : HomeItem() {
    override fun at(x: Int, y: Int) = copy(x = x, y = y)
}

@Serializable
@SerialName("folder")
data class FolderItem(
    override val id: String = newId(),
    override val x: Int = 0,
    override val y: Int = 0,
    val name: String = "Folder",
    val apps: List<String> = emptyList(),
) : HomeItem() {
    override fun at(x: Int, y: Int) = copy(x = x, y = y)
}

@Serializable
@SerialName("widget")
data class WidgetItem(
    override val id: String = newId(),
    override val x: Int = 0,
    override val y: Int = 0,
    val widgetId: Int,
    override val spanX: Int = 2,
    override val spanY: Int = 2,
) : HomeItem() {
    override fun at(x: Int, y: Int) = copy(x = x, y = y)
}

@Serializable
@SerialName("shortcut")
data class ShortcutItem(
    override val id: String = newId(),
    override val x: Int = 0,
    override val y: Int = 0,
    val packageName: String,
    val shortcutId: String,
    val userSerial: Long,
    val label: String,
) : HomeItem() {
    override fun at(x: Int, y: Int) = copy(x = x, y = y)
}

/** Where a dragged item is dropped. */
sealed interface DropTarget {
    data class Page(val page: Int, val x: Int, val y: Int) : DropTarget
    data class Dock(val slot: Int) : DropTarget
}

/** Pure functions over [HomeLayout]; easy to reason about and to test. */
object LayoutOps {

    private sealed interface Location {
        data class OnPage(val page: Int) : Location
        data object InDock : Location
    }

    private fun locate(layout: HomeLayout, id: String): Pair<HomeItem, Location>? {
        layout.pages.forEachIndexed { i, p ->
            p.items.firstOrNull { it.id == id }?.let { return it to Location.OnPage(i) }
        }
        layout.dock.firstOrNull { it.id == id }?.let { return it to Location.InDock }
        return null
    }

    fun find(layout: HomeLayout, id: String): HomeItem? = locate(layout, id)?.first

    fun allItems(layout: HomeLayout): List<HomeItem> = layout.pages.flatMap { it.items } + layout.dock

    fun remove(layout: HomeLayout, id: String) = layout.copy(
        pages = layout.pages.map { p -> p.copy(items = p.items.filterNot { it.id == id }) },
        dock = layout.dock.filterNot { it.id == id },
    )

    fun update(layout: HomeLayout, id: String, transform: (HomeItem) -> HomeItem) = layout.copy(
        pages = layout.pages.map { p -> p.copy(items = p.items.map { if (it.id == id) transform(it) else it }) },
        dock = layout.dock.map { if (it.id == id) transform(it) else it },
    )

    fun fits(page: HomePage, x: Int, y: Int, w: Int, h: Int, cols: Int, rows: Int, ignoreId: String? = null): Boolean {
        if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false
        return page.items.none { it.id != ignoreId && it.overlaps(x, y, w, h) }
    }

    fun findFreeSpot(page: HomePage, w: Int, h: Int, cols: Int, rows: Int): Pair<Int, Int>? {
        for (y in 0..rows - h) for (x in 0..cols - w) {
            if (fits(page, x, y, w, h, cols, rows)) return x to y
        }
        return null
    }

    /** Adds an item at the first free spot, starting at [startPage]; appends a page if all are full. */
    fun addToHome(layout: HomeLayout, item: HomeItem, cols: Int, rows: Int, startPage: Int = 0): HomeLayout {
        val w = item.spanX.coerceAtMost(cols)
        val h = item.spanY.coerceAtMost(rows)
        val order = layout.pages.indices.let { idx ->
            val s = startPage.coerceIn(0, (layout.pages.size - 1).coerceAtLeast(0))
            idx.drop(s) + idx.take(s)
        }
        for (i in order) {
            val spot = findFreeSpot(layout.pages[i], w, h, cols, rows) ?: continue
            return layout.copy(pages = layout.pages.mapIndexed { pi, p ->
                if (pi == i) p.copy(items = p.items + item.at(spot.first, spot.second)) else p
            })
        }
        return layout.copy(pages = layout.pages + HomePage(items = listOf(item.at(0, 0))))
    }

    /**
     * Drops [item] (which may or may not already be in the layout) on [target].
     * Dropping an app on an app makes a folder; on a folder adds to it; on anything else 1×1 swaps.
     * Returns the unchanged layout if the drop is not possible.
     */
    fun drop(layout: HomeLayout, item: HomeItem, target: DropTarget, cols: Int, rows: Int, dockSlots: Int): HomeLayout {
        val origin = locate(layout, item.id)
        val base = if (origin != null) remove(layout, item.id) else layout

        fun merge(occupant: HomeItem): HomeItem? = when {
            item is AppItem && occupant is AppItem && occupant.appKey != item.appKey ->
                FolderItem(x = occupant.x, y = occupant.y, apps = listOf(occupant.appKey, item.appKey))
            item is AppItem && occupant is FolderItem ->
                occupant.copy(apps = (occupant.apps + item.appKey).distinct())
            else -> null
        }

        /** Puts [occupant] where the dragged item came from (a swap). */
        fun sendBack(l: HomeLayout, occupant: HomeItem): HomeLayout? {
            val (orig, loc) = origin ?: return null
            if (occupant.spanX != 1 || occupant.spanY != 1) return null
            val moved = occupant.at(orig.x, orig.y)
            return when (loc) {
                is Location.OnPage -> l.copy(pages = l.pages.mapIndexed { i, p ->
                    if (i == loc.page) p.copy(items = p.items.filterNot { it.id == occupant.id } + moved)
                    else p.copy(items = p.items.filterNot { it.id == occupant.id })
                }, dock = l.dock.filterNot { it.id == occupant.id })
                Location.InDock -> if (occupant is WidgetItem) null else l.copy(
                    pages = l.pages.map { p -> p.copy(items = p.items.filterNot { it.id == occupant.id }) },
                    dock = l.dock.filterNot { it.id == occupant.id } + moved,
                )
            }
        }

        return when (target) {
            is DropTarget.Page -> {
                val pages = if (target.page >= base.pages.size) base.pages + HomePage() else base.pages
                if (target.page !in pages.indices) return layout
                val page = pages[target.page]
                val w = item.spanX.coerceAtMost(cols)
                val h = item.spanY.coerceAtMost(rows)
                val x = target.x.coerceIn(0, cols - w)
                val y = target.y.coerceIn(0, rows - h)
                val withPages = base.copy(pages = pages)

                if (w == 1 && h == 1) {
                    val occupant = page.items.firstOrNull { it.covers(x, y) }
                    when {
                        occupant == null -> withPages.copy(pages = pages.mapIndexed { i, p ->
                            if (i == target.page) p.copy(items = p.items + item.at(x, y)) else p
                        })
                        merge(occupant) != null -> {
                            val merged = merge(occupant)!!
                            withPages.copy(pages = pages.mapIndexed { i, p ->
                                if (i == target.page) p.copy(items = p.items.map { if (it.id == occupant.id) merged else it }) else p
                            })
                        }
                        else -> {
                            val swapped = sendBack(withPages, occupant) ?: return layout
                            swapped.copy(pages = swapped.pages.mapIndexed { i, p ->
                                if (i == target.page) p.copy(items = p.items + item.at(x, y)) else p
                            })
                        }
                    }
                } else {
                    if (!fits(page, x, y, w, h, cols, rows)) return layout
                    withPages.copy(pages = pages.mapIndexed { i, p ->
                        if (i == target.page) p.copy(items = p.items + item.at(x, y)) else p
                    })
                }
            }

            is DropTarget.Dock -> {
                if (item is WidgetItem) return layout
                val slot = target.slot.coerceIn(0, (dockSlots - 1).coerceAtLeast(0))
                val occupant = base.dock.firstOrNull { it.x == slot }
                when {
                    occupant == null -> base.copy(dock = base.dock + item.at(slot, 0))
                    merge(occupant) != null -> {
                        val merged = merge(occupant)!!.at(slot, 0)
                        base.copy(dock = base.dock.map { if (it.id == occupant.id) merged else it })
                    }
                    else -> {
                        val swapped = sendBack(base, occupant) ?: return layout
                        swapped.copy(dock = swapped.dock + item.at(slot, 0))
                    }
                }
            }
        }.trimTrailingEmptyPages()
    }

    fun removeFromFolder(layout: HomeLayout, folderId: String, appKey: String): HomeLayout {
        val folder = find(layout, folderId) as? FolderItem ?: return layout
        val remaining = folder.apps - appKey
        return when (remaining.size) {
            0 -> remove(layout, folderId)
            1 -> update(layout, folderId) { AppItem(x = it.x, y = it.y, appKey = remaining.first()) }
            else -> update(layout, folderId) { (it as FolderItem).copy(apps = remaining) }
        }
    }

    /** Removes every reference to an app (on pages, in the dock and inside folders). */
    fun removeApp(layout: HomeLayout, predicate: (String) -> Boolean): HomeLayout {
        var l = layout
        allItems(layout).forEach { item ->
            when (item) {
                is AppItem -> if (predicate(item.appKey)) l = remove(l, item.id)
                is FolderItem -> item.apps.filter(predicate).forEach { key -> l = removeFromFolder(l, item.id, key) }
                else -> {}
            }
        }
        return l
    }

    fun HomeLayout.trimTrailingEmptyPages(): HomeLayout {
        val p = pages.toMutableList()
        while (p.size > 1 && p.last().items.isEmpty()) p.removeAt(p.lastIndex)
        return copy(pages = p)
    }

    /** Keeps items inside a new grid size: anything that no longer fits is moved to a free spot. */
    fun reflow(layout: HomeLayout, cols: Int, rows: Int, dockSlots: Int): HomeLayout {
        var result = layout.copy(pages = layout.pages.map { it.copy(items = emptyList()) })
        val overflow = mutableListOf<HomeItem>()
        layout.pages.forEachIndexed { i, page ->
            page.items.forEach { item ->
                val w = item.spanX.coerceAtMost(cols)
                val h = item.spanY.coerceAtMost(rows)
                val sized = if (item is WidgetItem) item.copy(spanX = w, spanY = h) else item
                val target = result.pages[i]
                if (fits(target, item.x, item.y, w, h, cols, rows)) {
                    result = result.copy(pages = result.pages.mapIndexed { pi, p ->
                        if (pi == i) p.copy(items = p.items + sized) else p
                    })
                } else overflow += sized
            }
        }
        overflow.forEach { result = addToHome(result, it, cols, rows) }
        val dockKeep = layout.dock.filter { it.x < dockSlots }
        val dockOverflow = layout.dock.filter { it.x >= dockSlots }
        result = result.copy(dock = dockKeep)
        dockOverflow.forEach { result = addToHome(result, it, cols, rows) }
        return result
    }
}
