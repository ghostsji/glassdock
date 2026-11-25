package dev.canvas.launcher.system

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import dev.canvas.launcher.SettingsActivity
import dev.canvas.launcher.data.ActionType
import dev.canvas.launcher.data.GestureBinding

/** Things only the home screen itself can do. */
interface InLauncherActions {
    fun openDrawer()
    fun openSearch()
    fun goToFirstPage()
    fun launchAppByKey(key: String)
}

object Actions {

    fun perform(context: Context, binding: GestureBinding, launcher: InLauncherActions) {
        when (binding.action) {
            ActionType.NONE -> {}
            ActionType.OPEN_DRAWER -> launcher.openDrawer()
            ActionType.SEARCH -> launcher.openSearch()
            ActionType.FIRST_PAGE -> launcher.goToFirstPage()
            ActionType.LAUNCH_APP -> binding.appKey?.let(launcher::launchAppByKey)
            ActionType.LAUNCHER_SETTINGS -> context.startActivity(
                Intent(context, SettingsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            ActionType.NOTIFICATIONS ->
                if (!LauncherAccessibilityService.perform(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS))
                    statusBar(context, "expandNotificationsPanel")
            ActionType.QUICK_SETTINGS ->
                if (!LauncherAccessibilityService.perform(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS))
                    statusBar(context, "expandSettingsPanel")
            ActionType.LOCK_SCREEN -> needsA11y(context, if (Build.VERSION.SDK_INT >= 28) AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN else null)
            ActionType.SCREENSHOT -> needsA11y(context, if (Build.VERSION.SDK_INT >= 28) AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT else null)
            ActionType.RECENTS -> needsA11y(context, AccessibilityService.GLOBAL_ACTION_RECENTS)
            ActionType.POWER_MENU -> needsA11y(context, AccessibilityService.GLOBAL_ACTION_POWER_DIALOG)
        }
    }

    private fun needsA11y(context: Context, action: Int?) {
        if (action == null) {
            Toast.makeText(context, "This gesture needs Android 9 or newer", Toast.LENGTH_SHORT).show()
            return
        }
        if (LauncherAccessibilityService.perform(action)) return
        Toast.makeText(context, "Turn on \"Canvas gestures\" in Accessibility to use this", Toast.LENGTH_LONG).show()
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Works on most phones without accessibility, via the EXPAND_STATUS_BAR permission. */
    @SuppressLint("WrongConstant", "PrivateApi")
    private fun statusBar(context: Context, method: String) {
        runCatching {
            val service = context.getSystemService("statusbar")
            Class.forName("android.app.StatusBarManager").getMethod(method).invoke(service)
        }
    }
}
