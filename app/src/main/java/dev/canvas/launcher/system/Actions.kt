package dev.canvas.launcher.system

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.MediaStore
import android.provider.Settings
import android.view.KeyEvent
import android.widget.Toast
import dev.canvas.launcher.Features
import dev.canvas.launcher.SettingsActivity
import dev.canvas.launcher.data.ActionType
import dev.canvas.launcher.data.GestureBinding

/** Things only the home screen itself can do. */
interface InLauncherActions {
    fun openDrawer()
    fun openSearch()
    fun goToFirstPage()
    fun nextPage()
    fun previousPage()
    fun openHomeMenu()
    fun openWidgetPicker()
    fun toggleLayoutLock()
    fun openWallpaperPicker()
    fun launchAppByKey(key: String)
}

object Actions {

    fun perform(context: Context, binding: GestureBinding, launcher: InLauncherActions) {
        when (val a = binding.action) {
            ActionType.NONE -> {}

            // ---- Canvas
            ActionType.OPEN_DRAWER -> launcher.openDrawer()
            ActionType.SEARCH -> launcher.openSearch()
            ActionType.HOME_MENU -> launcher.openHomeMenu()
            ActionType.WIDGETS -> launcher.openWidgetPicker()
            ActionType.FIRST_PAGE -> launcher.goToFirstPage()
            ActionType.NEXT_PAGE -> launcher.nextPage()
            ActionType.PREVIOUS_PAGE -> launcher.previousPage()
            ActionType.LOCK_LAYOUT -> launcher.toggleLayoutLock()
            ActionType.WALLPAPER -> launcher.openWallpaperPicker()
            ActionType.LAUNCH_APP -> binding.appKey?.let(launcher::launchAppByKey)
            ActionType.LAUNCHER_SETTINGS -> open(context, Intent(context, SettingsActivity::class.java))

            // ---- System
            ActionType.NOTIFICATIONS ->
                if (!LauncherAccessibilityService.perform(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS))
                    statusBar(context, "expandNotificationsPanel")
            ActionType.QUICK_SETTINGS ->
                if (!LauncherAccessibilityService.perform(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS))
                    statusBar(context, "expandSettingsPanel")
            ActionType.LOCK_SCREEN -> needsA11y(context, if (Build.VERSION.SDK_INT >= 28) AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN else null)
            ActionType.SCREENSHOT -> needsA11y(context, if (Build.VERSION.SDK_INT >= 28) AccessibilityService.GLOBAL_ACTION_TAKE_SCREENSHOT else null)
            ActionType.RECENTS -> needsA11y(context, AccessibilityService.GLOBAL_ACTION_RECENTS)
            ActionType.SPLIT_SCREEN -> needsA11y(context, AccessibilityService.GLOBAL_ACTION_TOGGLE_SPLIT_SCREEN)
            ActionType.POWER_MENU -> needsA11y(context, AccessibilityService.GLOBAL_ACTION_POWER_DIALOG)
            ActionType.ASSISTANT -> open(context, Intent(Intent.ACTION_VOICE_COMMAND), Intent(Intent.ACTION_ASSIST))

            // ---- Toggles
            ActionType.FLASHLIGHT -> Torch.toggle(context)
            ActionType.DO_NOT_DISTURB -> toggleDnd(context)

            // ---- Sound & media
            ActionType.VOLUME -> context.getSystemService(AudioManager::class.java)
                .adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_SAME, AudioManager.FLAG_SHOW_UI)
            ActionType.MEDIA_PLAY_PAUSE -> mediaKey(context, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
            ActionType.MEDIA_NEXT -> mediaKey(context, KeyEvent.KEYCODE_MEDIA_NEXT)
            ActionType.MEDIA_PREVIOUS -> mediaKey(context, KeyEvent.KEYCODE_MEDIA_PREVIOUS)

            // ---- Apps & tools
            ActionType.CAMERA -> open(context, Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA))
            ActionType.SELFIE -> open(context,
                Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
                    .putExtra("android.intent.extras.CAMERA_FACING", 1)
                    .putExtra("android.intent.extras.LENS_FACING_FRONT", 1)
                    .putExtra("android.intent.extra.USE_FRONT_CAMERA", true))
            ActionType.VIDEO -> open(context, Intent(MediaStore.INTENT_ACTION_VIDEO_CAMERA))
            ActionType.DIALER -> open(context, Intent(Intent.ACTION_DIAL))
            ActionType.ALARMS -> open(context, Intent(AlarmClock.ACTION_SHOW_ALARMS))
            ActionType.TIMERS -> open(context, Intent(AlarmClock.ACTION_SHOW_TIMERS), Intent(AlarmClock.ACTION_SHOW_ALARMS))
            ActionType.CALENDAR -> open(context, Intent(Intent.ACTION_VIEW,
                CalendarContract.CONTENT_URI.buildUpon().appendPath("time").appendPath(System.currentTimeMillis().toString()).build()))
            ActionType.WEB_BROWSER -> open(context, Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER))
            ActionType.PLAY_STORE -> open(context, Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=")),
                Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MARKET))

            // ---- Everything else is a settings page or panel
            else -> settingsIntents(a).let { if (it.isNotEmpty()) open(context, *it.toTypedArray()) }
        }
    }

    /** Settings screens, best first; later ones are fallbacks for phones that lack the first. */
    private fun settingsIntents(a: ActionType): List<Intent> {
        fun s(action: String) = Intent(action)
        val panel29 = Build.VERSION.SDK_INT >= 29
        return when (a) {
            ActionType.SOUND_SETTINGS -> listOf(s(Settings.ACTION_SOUND_SETTINGS))
            ActionType.INTERNET_PANEL -> listOfNotNull(
                if (panel29) s(Settings.Panel.ACTION_INTERNET_CONNECTIVITY) else null, s(Settings.ACTION_WIFI_SETTINGS))
            ActionType.WIFI_SETTINGS -> listOf(s(Settings.ACTION_WIFI_SETTINGS))
            ActionType.BLUETOOTH_SETTINGS -> listOf(s(Settings.ACTION_BLUETOOTH_SETTINGS))
            ActionType.MOBILE_NETWORK -> listOf(s(Settings.ACTION_NETWORK_OPERATOR_SETTINGS), s(Settings.ACTION_DATA_ROAMING_SETTINGS),
                s(Settings.ACTION_WIRELESS_SETTINGS))
            ActionType.DATA_USAGE -> listOfNotNull(
                if (Build.VERSION.SDK_INT >= 28) s(Settings.ACTION_DATA_USAGE_SETTINGS) else null, s(Settings.ACTION_WIRELESS_SETTINGS))
            ActionType.HOTSPOT -> listOf(s("android.settings.TETHER_SETTINGS"), s(Settings.ACTION_WIRELESS_SETTINGS))
            ActionType.AIRPLANE_MODE -> listOf(s(Settings.ACTION_AIRPLANE_MODE_SETTINGS))
            ActionType.NFC -> listOfNotNull(if (panel29) s(Settings.Panel.ACTION_NFC) else null, s(Settings.ACTION_NFC_SETTINGS))
            ActionType.VPN -> listOf(s(Settings.ACTION_VPN_SETTINGS))
            ActionType.CAST -> listOf(s(Settings.ACTION_CAST_SETTINGS))
            ActionType.LOCATION -> listOf(s(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            ActionType.SYSTEM_SETTINGS -> listOf(s(Settings.ACTION_SETTINGS))
            ActionType.DISPLAY_SETTINGS -> listOf(s(Settings.ACTION_DISPLAY_SETTINGS))
            ActionType.NIGHT_LIGHT -> listOf(s("android.settings.NIGHT_DISPLAY_SETTINGS"), s(Settings.ACTION_DISPLAY_SETTINGS))
            ActionType.BATTERY -> listOf(s(Intent.ACTION_POWER_USAGE_SUMMARY), s(Settings.ACTION_BATTERY_SAVER_SETTINGS))
            ActionType.BATTERY_SAVER -> listOf(s(Settings.ACTION_BATTERY_SAVER_SETTINGS))
            ActionType.STORAGE -> listOf(s(Settings.ACTION_INTERNAL_STORAGE_SETTINGS))
            ActionType.APPS_SETTINGS -> listOf(s(Settings.ACTION_APPLICATION_SETTINGS))
            ActionType.DEFAULT_APPS -> listOf(s(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
            ActionType.NOTIFICATION_SETTINGS -> listOf(s("android.settings.NOTIFICATION_SETTINGS"), s(Settings.ACTION_SETTINGS))
            ActionType.DND_SETTINGS -> listOf(s("android.settings.ZEN_MODE_SETTINGS"), s(Settings.ACTION_SOUND_SETTINGS))
            ActionType.SECURITY -> listOf(s(Settings.ACTION_SECURITY_SETTINGS))
            ActionType.PRIVACY -> listOfNotNull(if (panel29) s(Settings.ACTION_PRIVACY_SETTINGS) else null, s(Settings.ACTION_SECURITY_SETTINGS))
            ActionType.ACCOUNTS -> listOf(s(Settings.ACTION_SYNC_SETTINGS))
            ActionType.ACCESSIBILITY -> listOf(s(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            ActionType.LANGUAGE -> listOf(s(Settings.ACTION_LOCALE_SETTINGS))
            ActionType.KEYBOARD -> listOf(s(Settings.ACTION_INPUT_METHOD_SETTINGS))
            ActionType.DATE_TIME -> listOf(s(Settings.ACTION_DATE_SETTINGS))
            ActionType.DEVELOPER_OPTIONS -> listOf(s(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS), s(Settings.ACTION_DEVICE_INFO_SETTINGS))
            ActionType.ABOUT_PHONE -> listOf(s(Settings.ACTION_DEVICE_INFO_SETTINGS))
            ActionType.HOME_APP -> listOf(s(Settings.ACTION_HOME_SETTINGS), s(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
            else -> emptyList()
        }
    }

    /** Starts the first intent that something on this phone can handle. */
    private fun open(context: Context, vararg intents: Intent) {
        for (i in intents) {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(i)
                return
            } catch (e: Exception) {
                // Try the next fallback.
            }
        }
        Toast.makeText(context, "This phone doesn't have that screen", Toast.LENGTH_SHORT).show()
    }

    private fun mediaKey(context: Context, code: Int) {
        val audio = context.getSystemService(AudioManager::class.java)
        val now = SystemClock.uptimeMillis()
        audio.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0))
        audio.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0))
    }

    private fun toggleDnd(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        if (!nm.isNotificationPolicyAccessGranted) {
            Toast.makeText(context, "Allow Canvas to change Do Not Disturb, then try again", Toast.LENGTH_LONG).show()
            open(context, Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
            return
        }
        val on = nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL
        nm.setInterruptionFilter(if (on) NotificationManager.INTERRUPTION_FILTER_ALL else NotificationManager.INTERRUPTION_FILTER_PRIORITY)
        Toast.makeText(context, if (on) "Do Not Disturb off" else "Do Not Disturb on", Toast.LENGTH_SHORT).show()
    }

    private fun needsA11y(context: Context, action: Int?) {
        if (!Features.full) {
            Toast.makeText(context, "This gesture is only in Canvas Full", Toast.LENGTH_SHORT).show()
            return
        }
        if (action == null) {
            Toast.makeText(context, "This gesture needs Android 9 or newer", Toast.LENGTH_SHORT).show()
            return
        }
        if (LauncherAccessibilityService.perform(action)) return
        Toast.makeText(context, "Turn on \"Canvas gestures\" in Accessibility to use this", Toast.LENGTH_LONG).show()
        open(context, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
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

/** Flashlight toggle; needs no permission. */
object Torch {
    @Volatile private var on = false
    private var registered = false

    fun toggle(context: Context) {
        val cm = context.getSystemService(CameraManager::class.java)
        if (!registered) {
            cm.registerTorchCallback(object : CameraManager.TorchCallback() {
                override fun onTorchModeChanged(cameraId: String, enabled: Boolean) { on = enabled }
            }, Handler(Looper.getMainLooper()))
            registered = true
        }
        val id = runCatching {
            cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
        }.getOrNull()
        if (id == null) {
            Toast.makeText(context, "No flashlight found", Toast.LENGTH_SHORT).show()
            return
        }
        runCatching { cm.setTorchMode(id, !on); on = !on }
            .onFailure { Toast.makeText(context, "Flashlight is busy (camera in use?)", Toast.LENGTH_SHORT).show() }
    }
}
