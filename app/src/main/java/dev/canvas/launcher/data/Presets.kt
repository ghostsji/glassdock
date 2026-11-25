package dev.canvas.launcher.data

/**
 * One-tap starting points. Each preset only changes looks and behaviour —
 * it never touches the user's home-screen layout, hidden apps or renames.
 */
data class Preset(
    val name: String,
    val description: String,
    val apply: (LauncherConfig) -> LauncherConfig,
)

object Presets {
    val all = listOf(
        Preset("Canvas default", "Balanced, colourful, follows your wallpaper.") { LauncherConfig() },

        Preset("Minimal", "Text-only drawer, no dock, a big clock and nothing else.") {
            LauncherConfig(
                home = HomeConfig(clockStyle = ClockStyle.STACKED, searchBar = SearchBarPosition.HIDDEN,
                    pageIndicator = PageIndicator.NONE, columns = 4, rows = 6),
                dock = DockConfig(enabled = false),
                icons = IconConfig(showLabels = false, themedIcons = true, shape = IconShape.CIRCLE),
                drawer = DrawerConfig(style = DrawerStyle.TEXT, showSuggestions = false, autoKeyboard = true),
                theme = ThemeConfig(mode = ThemeMode.AMOLED, font = FontChoice.SANS),
            )
        },

        Preset("Large & easy", "Bigger icons, text and touch targets. Great for anyone who wants things clearer.") {
            it.copy(
                home = it.home.copy(columns = 3, rows = 5, clockStyle = ClockStyle.LARGE,
                    searchBar = SearchBarPosition.TOP),
                icons = it.icons.copy(sizeDp = 72, labelSizeSp = 16, labelLines = 2, showLabels = true),
                dock = it.dock.copy(slots = 4, showLabels = true),
                drawer = it.drawer.copy(style = DrawerStyle.LIST, columns = 3),
                theme = it.theme.copy(fontScale = 1.25f, highContrast = true),
                gestures = GestureConfig(
                    swipeUp = GestureBinding(ActionType.OPEN_DRAWER),
                    swipeDown = GestureBinding(ActionType.NOTIFICATIONS),
                    doubleTap = GestureBinding(ActionType.NONE),
                ),
                behavior = it.behavior.copy(animationSpeed = 0.8f),
            )
        },

        Preset("Power user", "Dense 6-column grid, number badges, every gesture wired up.") {
            it.copy(
                home = it.home.copy(columns = 6, rows = 7, clockStyle = ClockStyle.SMALL, pageIndicator = PageIndicator.NUMBER),
                icons = it.icons.copy(sizeDp = 46, labelSizeSp = 11),
                dock = it.dock.copy(slots = 6),
                drawer = it.drawer.copy(columns = 6, sort = SortMode.MOST_USED),
                badges = BadgeConfig(enabled = true, style = BadgeStyle.COUNT),
                search = it.search.copy(contacts = true, fuzzy = true),
                behavior = it.behavior.copy(animationSpeed = 1.5f),
            )
        },

        Preset("Focus", "Monochrome themed icons, no badges, fewer distractions.") {
            it.copy(
                icons = it.icons.copy(themedIcons = true, shape = IconShape.SQUIRCLE),
                badges = it.badges.copy(enabled = false),
                drawer = it.drawer.copy(showSuggestions = false),
                home = it.home.copy(wallpaperDim = 0.35f, clockStyle = ClockStyle.MINIMAL),
            )
        },

        Preset("Classic phone", "Familiar layout: 4×5 grid, labels everywhere, full-width dock.") {
            it.copy(
                home = it.home.copy(columns = 4, rows = 5, searchBar = SearchBarPosition.BOTTOM, clockStyle = ClockStyle.SMALL),
                icons = it.icons.copy(shape = IconShape.ROUNDED, sizeDp = 58, showLabels = true),
                dock = it.dock.copy(slots = 4, background = DockBackground.BAR, showLabels = false),
                drawer = it.drawer.copy(columns = 4),
            )
        },
    )
}
