package dev.canvas.launcher

import dev.canvas.launcher.data.ActionType

/** What this build of Canvas can do (see the lite / full flavors in app/build.gradle.kts). */
object Features {
    /** Notification badges + accessibility gestures. */
    val full: Boolean = BuildConfig.FULL_FEATURES

    /** Gesture actions that need the accessibility service (full build only). */
    val a11yActions = setOf(ActionType.LOCK_SCREEN, ActionType.RECENTS, ActionType.POWER_MENU, ActionType.SCREENSHOT)

    fun available(action: ActionType) = full || action !in a11yActions
}
