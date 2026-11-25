package dev.canvas.launcher.apps

import android.app.ActivityOptions
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.LauncherActivityInfo
import android.content.pm.LauncherApps
import android.content.pm.ShortcutInfo
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.UserHandle
import android.os.UserManager
import android.view.View
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** An installed, launchable activity (in the personal or work profile). */
data class RawApp(
    /** Stable id: "package/.Activity|userSerial". */
    val key: String,
    val label: String,
    val component: ComponentName,
    val user: UserHandle,
    val userSerial: Long,
    val installTime: Long,
    val isWork: Boolean,
    val info: LauncherActivityInfo,
) {
    val packageName: String get() = component.packageName
}

class AppRepository(
    private val context: Context,
    private val scope: CoroutineScope,
    private val icons: IconCache,
) {
    private val launcherApps = context.getSystemService(LauncherApps::class.java)
    private val userManager = context.getSystemService(UserManager::class.java)

    private val _apps = MutableStateFlow<List<RawApp>>(emptyList())
    val apps: StateFlow<List<RawApp>> = _apps.asStateFlow()

    private val _shortcutsVersion = MutableStateFlow(0)
    val shortcutsVersion: StateFlow<Int> = _shortcutsVersion.asStateFlow()

    var onPackageRemoved: ((String, Long) -> Unit)? = null

    private var refreshJob: Job? = null

    private val callback = object : LauncherApps.Callback() {
        override fun onPackageRemoved(packageName: String, user: UserHandle) {
            icons.invalidate(packageName)
            onPackageRemoved?.invoke(packageName, serialOf(user))
            refresh()
        }
        override fun onPackageAdded(packageName: String, user: UserHandle) {
            IconPack.invalidate(packageName); icons.invalidate(packageName); refresh()
        }
        override fun onPackageChanged(packageName: String, user: UserHandle) {
            IconPack.invalidate(packageName); icons.invalidate(packageName); refresh()
        }
        override fun onPackagesAvailable(packageNames: Array<out String>, user: UserHandle, replacing: Boolean) = refresh()
        override fun onPackagesUnavailable(packageNames: Array<out String>, user: UserHandle, replacing: Boolean) = refresh()
        override fun onShortcutsChanged(packageName: String, shortcuts: MutableList<ShortcutInfo>, user: UserHandle) {
            icons.invalidate(packageName)
            _shortcutsVersion.update { it + 1 }
        }
    }

    init {
        launcherApps.registerCallback(callback, Handler(Looper.getMainLooper()))
        refresh()
    }

    fun serialOf(user: UserHandle): Long = userManager.getSerialNumberForUser(user)
    fun userFor(serial: Long): UserHandle? = userManager.getUserForSerialNumber(serial)

    fun refresh() {
        refreshJob?.cancel()
        refreshJob = scope.launch(Dispatchers.IO) {
            val me = Process.myUserHandle()
            val list = userManager.userProfiles.flatMap { user ->
                val serial = serialOf(user)
                runCatching { launcherApps.getActivityList(null, user) }.getOrDefault(emptyList()).map { info ->
                    RawApp(
                        key = "${info.componentName.flattenToShortString()}|$serial",
                        label = info.label.toString().trim(),
                        component = info.componentName,
                        user = user,
                        userSerial = serial,
                        installTime = info.firstInstallTime,
                        isWork = user != me,
                        info = info,
                    )
                }
            }.filterNot { it.packageName == context.packageName && it.component.className.endsWith("LauncherActivity") }
            _apps.value = list
        }
    }

    fun launch(app: RawApp, bounds: Rect?, view: View?) {
        val opts = if (view != null && bounds != null)
            ActivityOptions.makeClipRevealAnimation(view, bounds.left, bounds.top, bounds.width(), bounds.height()).toBundle()
        else null
        try {
            launcherApps.startMainActivity(app.component, app.user, bounds, opts)
        } catch (e: Exception) {
            Toast.makeText(context, "Couldn't open ${app.label}", Toast.LENGTH_SHORT).show()
        }
    }

    fun openAppInfo(app: RawApp) = runCatching {
        launcherApps.startAppDetailsActivity(app.component, app.user, null, null)
    }

    fun uninstallIntent(app: RawApp): Intent =
        Intent(Intent.ACTION_DELETE, Uri.fromParts("package", app.packageName, null))
            .putExtra(Intent.EXTRA_USER, app.user)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    // ---------------------------------------------------------------- App shortcuts

    val canUseShortcuts: Boolean get() = runCatching { launcherApps.hasShortcutHostPermission() }.getOrDefault(false)

    fun shortcutsFor(app: RawApp): List<ShortcutInfo> {
        if (!canUseShortcuts) return emptyList()
        val q = LauncherApps.ShortcutQuery()
            .setPackage(app.packageName)
            .setActivity(app.component)
            .setQueryFlags(
                LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC or
                    LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST or
                    LauncherApps.ShortcutQuery.FLAG_MATCH_PINNED,
            )
        return runCatching { launcherApps.getShortcuts(q, app.user) }.getOrNull().orEmpty()
            .filter { it.isEnabled && (it.isDynamic || it.isDeclaredInManifest) }
            .sortedWith(compareBy({ !it.isDeclaredInManifest }, { it.rank }))
            .take(5)
    }

    /** Every app shortcut on the device (for universal search). */
    fun allShortcuts(): List<Pair<ShortcutInfo, UserHandle>> {
        if (!canUseShortcuts) return emptyList()
        val q = LauncherApps.ShortcutQuery().setQueryFlags(
            LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC or LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST,
        )
        return userManager.userProfiles.flatMap { user ->
            runCatching { launcherApps.getShortcuts(q, user) }.getOrNull().orEmpty()
                .filter { it.isEnabled }.map { it to user }
        }
    }

    fun findShortcut(pkg: String, id: String, user: UserHandle): ShortcutInfo? {
        if (!canUseShortcuts) return null
        val q = LauncherApps.ShortcutQuery()
            .setPackage(pkg)
            .setShortcutIds(listOf(id))
            .setQueryFlags(
                LauncherApps.ShortcutQuery.FLAG_MATCH_PINNED or
                    LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC or
                    LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST,
            )
        return runCatching { launcherApps.getShortcuts(q, user) }.getOrNull()?.firstOrNull()
    }

    fun shortcutIcon(s: ShortcutInfo): Drawable? =
        runCatching { launcherApps.getShortcutIconDrawable(s, context.resources.displayMetrics.densityDpi) }.getOrNull()

    fun startShortcut(pkg: String, id: String, user: UserHandle, bounds: Rect? = null) {
        try {
            launcherApps.startShortcut(pkg, id, bounds, null, user)
        } catch (e: Exception) {
            Toast.makeText(context, "That shortcut isn't available any more", Toast.LENGTH_SHORT).show()
        }
    }

    /** Tells the system which shortcuts of [pkg] we keep on the home screen. */
    fun setPinned(pkg: String, ids: List<String>, user: UserHandle) {
        if (!canUseShortcuts) return
        runCatching { launcherApps.pinShortcuts(pkg, ids, user) }
    }

    fun unregister() = launcherApps.unregisterCallback(callback)
}
