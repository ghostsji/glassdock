package dev.canvas.launcher

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.pm.LauncherApps
import android.os.Bundle
import android.widget.Toast
import dev.canvas.launcher.data.LayoutOps
import dev.canvas.launcher.data.ShortcutItem
import dev.canvas.launcher.data.WidgetItem

/**
 * Handles "Add to home screen" from other apps — Chrome bookmarks, Maps directions,
 * contact shortcuts, and widgets pinned from inside apps.
 */
class AddItemActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val launcherApps = getSystemService(LauncherApps::class.java)
        val request = runCatching { launcherApps.getPinItemRequest(intent) }.getOrNull()
        if (request == null || !request.isValid) { finish(); return }

        val store = canvas.store
        val cfg = store.config.value
        val cols = cfg.home.columns
        val rows = cfg.home.rows

        when (request.requestType) {
            LauncherApps.PinItemRequest.REQUEST_TYPE_SHORTCUT -> {
                val info = request.shortcutInfo
                if (info != null && request.accept()) {
                    val item = ShortcutItem(
                        packageName = info.`package`,
                        shortcutId = info.id,
                        userSerial = canvas.apps.serialOf(info.userHandle),
                        label = (info.shortLabel ?: info.longLabel ?: "Shortcut").toString(),
                    )
                    store.updateLayout { LayoutOps.addToHome(it, item, cols, rows) }
                    Toast.makeText(this, "Added to home screen", Toast.LENGTH_SHORT).show()
                }
            }
            LauncherApps.PinItemRequest.REQUEST_TYPE_APPWIDGET -> {
                val info = request.getAppWidgetProviderInfo(this)
                if (info != null) {
                    val widgets = canvas.widgets
                    val id = widgets.host.allocateAppWidgetId()
                    val accepted = request.accept(Bundle().apply { putInt(AppWidgetManager.EXTRA_APPWIDGET_ID, id) })
                    if (accepted) {
                        val (w, h) = widgets.spanFor(info, cols, rows)
                        store.updateLayout { LayoutOps.addToHome(it, WidgetItem(widgetId = id, spanX = w, spanY = h), cols, rows) }
                        Toast.makeText(this, "Widget added to home screen", Toast.LENGTH_SHORT).show()
                    } else widgets.delete(id)
                }
            }
        }
        finish()
    }
}
