package dev.canvas.launcher

import android.app.WallpaperColors
import android.app.WallpaperManager
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dev.canvas.launcher.data.ActionType
import dev.canvas.launcher.data.GestureBinding
import dev.canvas.launcher.data.LauncherConfig
import dev.canvas.launcher.data.OrientationMode
import dev.canvas.launcher.system.Actions
import dev.canvas.launcher.system.InLauncherActions
import dev.canvas.launcher.ui.LauncherHost
import dev.canvas.launcher.ui.LauncherScreen
import dev.canvas.launcher.ui.LauncherViewModel
import kotlinx.coroutines.launch

class LauncherActivity : ComponentActivity(), LauncherHost, InLauncherActions {

    private val vm: LauncherViewModel by viewModels()
    private val widgets get() = canvas.widgets

    /** A widget waiting for bind permission or configuration. */
    private var pendingWidgetId: Int = -1
    private var pendingWidgetInfo: AppWidgetProviderInfo? = null

    /** WallpaperManager.OnColorsChangedListener on Android 8.1+, kept untyped for Android 8.0. */
    private var wallpaperListener: Any? = null

    override val rootView: View get() = window.decorView

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        savedInstanceState?.let {
            pendingWidgetId = it.getInt(KEY_PENDING_ID, -1)
        }
        setContent { LauncherScreen(vm, this) }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                vm.config.collect { applyWindowSettings(it) }
            }
        }
        if (Build.VERSION.SDK_INT >= 27) {
            val listener = WallpaperManager.OnColorsChangedListener { _, which ->
                if ((which and WallpaperManager.FLAG_SYSTEM) != 0) refreshWallpaperLightness()
            }
            WallpaperManager.getInstance(this).addOnColorsChangedListener(listener, Handler(Looper.getMainLooper()))
            wallpaperListener = listener
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt(KEY_PENDING_ID, pendingWidgetId)
    }

    override fun onStart() {
        super.onStart()
        runCatching { widgets.host.startListening() }
    }

    override fun onStop() {
        super.onStop()
        runCatching { widgets.host.stopListening() }
    }

    override fun onResume() {
        super.onResume()
        refreshWallpaperLightness()
        vm.repo.refresh()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 27) {
            (wallpaperListener as? WallpaperManager.OnColorsChangedListener)?.let {
                WallpaperManager.getInstance(this).removeOnColorsChangedListener(it)
            }
        }
        super.onDestroy()
    }

    /** The home button. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action != Intent.ACTION_MAIN || !intent.hasCategory(Intent.CATEGORY_HOME)) return
        val alreadyHome = hasWindowFocus() &&
            (intent.flags and Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT) != Intent.FLAG_ACTIVITY_BROUGHT_TO_FRONT
        val closedSomething = vm.ui.closeAll()
        if (alreadyHome && !closedSomething) perform(vm.config.value.gestures.homeButton)
    }

    /** Light wallpapers get dark labels, clock and status-bar icons. */
    private fun refreshWallpaperLightness() {
        val light = runCatching {
            when {
                Build.VERSION.SDK_INT >= 31 -> {
                    val c = WallpaperManager.getInstance(this).getWallpaperColors(WallpaperManager.FLAG_SYSTEM)
                    c != null && (c.colorHints and WallpaperColors.HINT_SUPPORTS_DARK_TEXT) != 0
                }
                Build.VERSION.SDK_INT >= 27 -> {
                    val c = WallpaperManager.getInstance(this).getWallpaperColors(WallpaperManager.FLAG_SYSTEM)
                    c != null && c.primaryColor.luminance() > 0.6f
                }
                else -> false
            }
        }.getOrDefault(false)
        vm.wallpaperIsLight.value = light
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = light
            isAppearanceLightNavigationBars = light
        }
    }

    private fun applyWindowSettings(cfg: LauncherConfig) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (cfg.home.hideStatusBar) controller.hide(WindowInsetsCompat.Type.statusBars())
        else controller.show(WindowInsetsCompat.Type.statusBars())
        requestedOrientation = when (cfg.behavior.orientation) {
            OrientationMode.AUTO -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            OrientationMode.PORTRAIT -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            OrientationMode.LANDSCAPE -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
    }

    // ---------------------------------------------------------------- LauncherHost

    override fun perform(binding: GestureBinding) {
        if (binding.action == ActionType.NONE) return
        Actions.perform(this, binding, this)
    }

    override fun openWallpaperPicker() {
        startSafely(Intent.createChooser(Intent(Intent.ACTION_SET_WALLPAPER), "Choose wallpaper"))
    }

    override fun openSettings() {
        startActivity(Intent(this, SettingsActivity::class.java))
    }

    override fun startSafely(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "No app can handle that", Toast.LENGTH_SHORT).show()
        } catch (e: SecurityException) {
            Toast.makeText(this, "Not allowed", Toast.LENGTH_SHORT).show()
        }
    }

    override fun addWidget(info: AppWidgetProviderInfo) {
        val id = widgets.host.allocateAppWidgetId()
        pendingWidgetId = id
        pendingWidgetInfo = info
        if (widgets.manager.bindAppWidgetIdIfAllowed(id, info.profile, info.provider, null)) {
            configureOrPlace()
        } else {
            @Suppress("DEPRECATION")
            startActivityForResult(
                Intent(AppWidgetManager.ACTION_APPWIDGET_BIND)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, info.provider)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER_PROFILE, info.profile),
                REQ_BIND,
            )
        }
    }

    override fun reconfigureWidget(widgetId: Int) {
        runCatching {
            widgets.host.startAppWidgetConfigureActivityForResult(this, widgetId, 0, REQ_RECONFIGURE, null)
        }.onFailure { Toast.makeText(this, "This widget has no settings", Toast.LENGTH_SHORT).show() }
    }

    private fun configureOrPlace() {
        val id = pendingWidgetId
        val info = pendingWidgetInfo ?: widgets.info(id) ?: return cancelPendingWidget()
        if (widgets.needsConfiguration(info)) {
            try {
                widgets.host.startAppWidgetConfigureActivityForResult(this, id, 0, REQ_CONFIGURE, null)
                return
            } catch (e: Exception) {
                // Fall through and place it anyway.
            }
        }
        placePendingWidget()
    }

    private fun placePendingWidget() {
        val id = pendingWidgetId
        val info = pendingWidgetInfo ?: widgets.info(id)
        if (id != -1 && info != null) vm.placeWidget(id, info)
        pendingWidgetId = -1
        pendingWidgetInfo = null
    }

    private fun cancelPendingWidget() {
        if (pendingWidgetId != -1) widgets.delete(pendingWidgetId)
        pendingWidgetId = -1
        pendingWidgetInfo = null
    }

    @Deprecated("Widget binding still uses the classic result API")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_BIND -> if (resultCode == RESULT_OK) configureOrPlace() else cancelPendingWidget()
            REQ_CONFIGURE -> if (resultCode == RESULT_OK) placePendingWidget() else cancelPendingWidget()
        }
    }

    // ---------------------------------------------------------------- InLauncherActions

    override fun openDrawer() { vm.ui.searchOpen = false; vm.ui.drawerOpen = true }
    override fun openSearch() { vm.ui.drawerOpen = false; vm.ui.searchOpen = true }
    override fun goToFirstPage() { vm.ui.pageRequest = 0 }
    override fun nextPage() {
        val last = vm.layout.value.pages.lastIndex
        vm.ui.pageRequest = (vm.ui.currentPage + 1).coerceAtMost(last)
    }
    override fun previousPage() { vm.ui.pageRequest = (vm.ui.currentPage - 1).coerceAtLeast(0) }
    override fun openHomeMenu() { vm.ui.sheet = dev.canvas.launcher.ui.Sheet.HomeMenu }
    override fun openWidgetPicker() { vm.ui.sheet = dev.canvas.launcher.ui.Sheet.WidgetPicker }
    override fun toggleLayoutLock() {
        vm.toggleLock()
        Toast.makeText(this, if (vm.config.value.home.lockLayout) "Layout locked" else "Layout unlocked", Toast.LENGTH_SHORT).show()
    }
    override fun launchAppByKey(key: String) = vm.launchKey(key, null, rootView)

    companion object {
        private const val REQ_BIND = 11
        private const val REQ_CONFIGURE = 12
        private const val REQ_RECONFIGURE = 13
        private const val KEY_PENDING_ID = "pending_widget"
    }
}
