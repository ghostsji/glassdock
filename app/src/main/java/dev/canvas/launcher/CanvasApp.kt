package dev.canvas.launcher

import android.app.Application
import android.content.Context
import dev.canvas.launcher.apps.AppRepository
import dev.canvas.launcher.apps.IconCache
import dev.canvas.launcher.data.LauncherStore
import dev.canvas.launcher.data.LayoutOps
import dev.canvas.launcher.system.WidgetHostManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** App-wide singletons shared by the home screen, settings and the add-item handler. */
class CanvasApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var store: LauncherStore private set
    lateinit var icons: IconCache private set
    lateinit var apps: AppRepository private set
    lateinit var widgets: WidgetHostManager private set

    override fun onCreate() {
        super.onCreate()
        store = LauncherStore(this, scope)
        icons = IconCache(this)
        apps = AppRepository(this, scope, icons)
        widgets = WidgetHostManager(this)

        // When an app is uninstalled, clean it off the home screen and out of folders.
        apps.onPackageRemoved = { pkg, serial ->
            store.updateLayout { layout ->
                LayoutOps.removeApp(layout) { key -> key.startsWith("$pkg/") && key.endsWith("|$serial") }
            }
        }
    }
}

val Context.canvas: CanvasApp get() = applicationContext as CanvasApp
