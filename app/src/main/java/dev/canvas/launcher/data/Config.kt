package dev.canvas.launcher.data

import kotlinx.serialization.Serializable

/**
 * Every customizable aspect of Canvas lives in this one tree.
 * It is saved as JSON, so a whole setup can be exported, shared and imported.
 * New fields must always have defaults so older backups keep loading.
 */
@Serializable
data class LauncherConfig(
    val theme: ThemeConfig = ThemeConfig(),
    val home: HomeConfig = HomeConfig(),
    val dock: DockConfig = DockConfig(),
    val icons: IconConfig = IconConfig(),
    val drawer: DrawerConfig = DrawerConfig(),
    val folders: FolderConfig = FolderConfig(),
    val gestures: GestureConfig = GestureConfig(),
    val search: SearchConfig = SearchConfig(),
    val badges: BadgeConfig = BadgeConfig(),
    val behavior: BehaviorConfig = BehaviorConfig(),
)

interface Labeled { val label: String }

// ---------------------------------------------------------------- Theme

@Serializable
enum class ThemeMode(override val label: String) : Labeled {
    SYSTEM("Follow system"), LIGHT("Light"), DARK("Dark"), AMOLED("Pure black (AMOLED)")
}

@Serializable
enum class AccentSource(override val label: String) : Labeled {
    WALLPAPER("From wallpaper (Material You)"), CUSTOM("Custom colour")
}

@Serializable
enum class FontChoice(override val label: String) : Labeled {
    DEFAULT("System default"), SANS("Sans serif"), SERIF("Serif"), MONO("Monospace"), CURSIVE("Handwritten")
}

@Serializable
data class ThemeConfig(
    val mode: ThemeMode = ThemeMode.SYSTEM,
    val accentSource: AccentSource = AccentSource.WALLPAPER,
    val customAccent: Long = 0xFF6750A4,
    val font: FontChoice = FontChoice.DEFAULT,
    val fontScale: Float = 1f,
    val cornerRadius: Int = 24,
    val highContrast: Boolean = false,
)

// ---------------------------------------------------------------- Home

@Serializable
enum class ClockStyle(override val label: String) : Labeled {
    LARGE("Large"), STACKED("Stacked"), SMALL("Compact"), MINIMAL("Minimal"), HIDDEN("Hidden")
}

@Serializable
enum class TimeFormat(override val label: String) : Labeled {
    SYSTEM("Follow system"), H12("12-hour"), H24("24-hour")
}

@Serializable
enum class SearchBarPosition(override val label: String) : Labeled {
    TOP("Top"), BOTTOM("Above dock"), HIDDEN("Hidden")
}

@Serializable
enum class PageIndicator(override val label: String) : Labeled {
    DOTS("Dots"), LINE("Line"), NUMBER("Page number"), NONE("None")
}

@Serializable
enum class TextAlign3(override val label: String) : Labeled {
    START("Left"), CENTER("Centre"), END("Right")
}

@Serializable
data class HomeConfig(
    val columns: Int = 5,
    val rows: Int = 6,
    val clockStyle: ClockStyle = ClockStyle.LARGE,
    val clockAlign: TextAlign3 = TextAlign3.START,
    val timeFormat: TimeFormat = TimeFormat.SYSTEM,
    val showDate: Boolean = true,
    val searchBar: SearchBarPosition = SearchBarPosition.TOP,
    val pageIndicator: PageIndicator = PageIndicator.DOTS,
    val hideStatusBar: Boolean = false,
    val wallpaperDim: Float = 0f,
    val sidePaddingDp: Int = 12,
    val textShadow: Boolean = true,
    val lockLayout: Boolean = false,
)

// ---------------------------------------------------------------- Dock

@Serializable
enum class DockBackground(override val label: String) : Labeled {
    PILL("Floating pill"), BAR("Full-width bar"), NONE("None")
}

@Serializable
data class DockConfig(
    val enabled: Boolean = true,
    val slots: Int = 5,
    val background: DockBackground = DockBackground.PILL,
    val opacity: Float = 0.3f,
    val showLabels: Boolean = false,
)

// ---------------------------------------------------------------- Icons

@Serializable
enum class IconShape(override val label: String) : Labeled {
    SYSTEM("System default"), CIRCLE("Circle"), SQUIRCLE("Squircle"), ROUNDED("Rounded square"),
    SQUARE("Square"), TEARDROP("Teardrop"), HEXAGON("Hexagon"), PEBBLE("Pebble")
}

@Serializable
data class IconConfig(
    val sizeDp: Int = 54,
    val shape: IconShape = IconShape.SYSTEM,
    val showLabels: Boolean = true,
    val labelSizeSp: Int = 12,
    val labelLines: Int = 1,
    /** null = automatic (adapts to the wallpaper). */
    val labelColor: Long? = null,
    /** Package name of the active icon pack, or null for app icons. */
    val iconPack: String? = null,
    val themedIcons: Boolean = false,
    val legacyIconBackground: Boolean = true,
)

// ---------------------------------------------------------------- Drawer

@Serializable
enum class DrawerStyle(override val label: String) : Labeled {
    GRID("Grid"), LIST("List"), TEXT("Text only (minimal)")
}

@Serializable
enum class SortMode(override val label: String) : Labeled {
    ALPHABETICAL("A to Z"), MOST_USED("Most used"), RECENTLY_INSTALLED("Recently installed")
}

@Serializable
data class DrawerConfig(
    val style: DrawerStyle = DrawerStyle.GRID,
    val columns: Int = 5,
    val sort: SortMode = SortMode.ALPHABETICAL,
    val backgroundOpacity: Float = 0.94f,
    val showSearch: Boolean = true,
    val autoKeyboard: Boolean = false,
    val fastScroller: Boolean = true,
    val showSuggestions: Boolean = true,
    val showLabels: Boolean = true,
)

// ---------------------------------------------------------------- Folders

@Serializable
enum class FolderPreview(override val label: String) : Labeled {
    GRID("2×2 grid"), STACK("Stacked"), FIRST("First app only")
}

@Serializable
data class FolderConfig(
    val preview: FolderPreview = FolderPreview.GRID,
    val columns: Int = 4,
    val backgroundOpacity: Float = 0.9f,
)

// ---------------------------------------------------------------- Gestures

@Serializable
enum class ActionType(override val label: String) : Labeled {
    NONE("Do nothing"),
    OPEN_DRAWER("Open app drawer"),
    SEARCH("Open search"),
    NOTIFICATIONS("Notifications"),
    QUICK_SETTINGS("Quick settings"),
    LOCK_SCREEN("Lock screen"),
    RECENTS("Recent apps"),
    POWER_MENU("Power menu"),
    SCREENSHOT("Take screenshot"),
    FIRST_PAGE("Go to first page"),
    LAUNCHER_SETTINGS("Canvas settings"),
    LAUNCH_APP("Open an app"),
}

@Serializable
data class GestureBinding(
    val action: ActionType = ActionType.NONE,
    /** App key, only used when [action] is LAUNCH_APP. */
    val appKey: String? = null,
)

@Serializable
data class GestureConfig(
    val swipeUp: GestureBinding = GestureBinding(ActionType.OPEN_DRAWER),
    val swipeDown: GestureBinding = GestureBinding(ActionType.NOTIFICATIONS),
    val doubleTap: GestureBinding = GestureBinding(if (dev.canvas.launcher.Features.full) ActionType.LOCK_SCREEN else ActionType.NONE),
    val twoFingerSwipeUp: GestureBinding = GestureBinding(ActionType.SEARCH),
    val twoFingerSwipeDown: GestureBinding = GestureBinding(ActionType.QUICK_SETTINGS),
    val homeButton: GestureBinding = GestureBinding(ActionType.FIRST_PAGE),
    val clockTap: GestureBinding = GestureBinding(ActionType.NONE),
)

// ---------------------------------------------------------------- Search

@Serializable
enum class SearchEngine(override val label: String, val url: String) : Labeled {
    GOOGLE("Google", "https://www.google.com/search?q="),
    DUCKDUCKGO("DuckDuckGo", "https://duckduckgo.com/?q="),
    BING("Bing", "https://www.bing.com/search?q="),
    BRAVE("Brave", "https://search.brave.com/search?q="),
    ECOSIA("Ecosia", "https://www.ecosia.org/search?q="),
    STARTPAGE("Startpage", "https://www.startpage.com/do/search?q="),
}

@Serializable
data class SearchConfig(
    val apps: Boolean = true,
    val contacts: Boolean = false,
    val calculator: Boolean = true,
    val shortcuts: Boolean = true,
    val web: Boolean = true,
    val engine: SearchEngine = SearchEngine.GOOGLE,
    val launchOnEnter: Boolean = true,
    val includeHidden: Boolean = false,
    val fuzzy: Boolean = true,
)

// ---------------------------------------------------------------- Badges

@Serializable
enum class BadgeStyle(override val label: String) : Labeled {
    DOT("Dot"), COUNT("Number")
}

@Serializable
data class BadgeConfig(
    val enabled: Boolean = false,
    val style: BadgeStyle = BadgeStyle.DOT,
    /** null = accent colour. */
    val color: Long? = null,
)

// ---------------------------------------------------------------- Behaviour

@Serializable
enum class OrientationMode(override val label: String) : Labeled {
    AUTO("Follow system"), PORTRAIT("Portrait only"), LANDSCAPE("Landscape only")
}

@Serializable
data class BehaviorConfig(
    val haptics: Boolean = true,
    val animationSpeed: Float = 1f,
    val orientation: OrientationMode = OrientationMode.PORTRAIT,
    val closeDrawerOnLaunch: Boolean = true,
)
