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

enum class ActionCategory(val title: String) {
    LAUNCHER("Canvas"), SYSTEM("System"), CONNECTIVITY("Connections"), SOUND("Sound & media"),
    TOGGLES("Quick toggles"), SETTINGS("Settings pages"), APPS("Apps & tools"),
}

@Serializable
enum class ActionType(override val label: String, val category: ActionCategory) : Labeled {
    NONE("Do nothing", ActionCategory.LAUNCHER),

    // Canvas itself
    OPEN_DRAWER("Open app drawer", ActionCategory.LAUNCHER),
    SEARCH("Open search", ActionCategory.LAUNCHER),
    HOME_MENU("Home screen menu", ActionCategory.LAUNCHER),
    WIDGETS("Add a widget", ActionCategory.LAUNCHER),
    FIRST_PAGE("Go to first page", ActionCategory.LAUNCHER),
    NEXT_PAGE("Next page", ActionCategory.LAUNCHER),
    PREVIOUS_PAGE("Previous page", ActionCategory.LAUNCHER),
    LOCK_LAYOUT("Lock / unlock layout", ActionCategory.LAUNCHER),
    WALLPAPER("Change wallpaper", ActionCategory.LAUNCHER),
    LAUNCHER_SETTINGS("Canvas settings", ActionCategory.LAUNCHER),
    LAUNCH_APP("Open an app…", ActionCategory.LAUNCHER),

    // System (accessibility-based ones are Canvas Full only)
    NOTIFICATIONS("Notifications", ActionCategory.SYSTEM),
    QUICK_SETTINGS("Quick settings", ActionCategory.SYSTEM),
    LOCK_SCREEN("Lock screen", ActionCategory.SYSTEM),
    RECENTS("Recent apps", ActionCategory.SYSTEM),
    SPLIT_SCREEN("Split screen", ActionCategory.SYSTEM),
    POWER_MENU("Power menu", ActionCategory.SYSTEM),
    SCREENSHOT("Take screenshot", ActionCategory.SYSTEM),
    ASSISTANT("Voice assistant", ActionCategory.SYSTEM),

    // Quick toggles
    FLASHLIGHT("Flashlight on / off", ActionCategory.TOGGLES),
    DO_NOT_DISTURB("Do Not Disturb on / off", ActionCategory.TOGGLES),

    // Sound & media
    VOLUME("Show volume slider", ActionCategory.SOUND),
    MEDIA_PLAY_PAUSE("Play / pause music", ActionCategory.SOUND),
    MEDIA_NEXT("Next track", ActionCategory.SOUND),
    MEDIA_PREVIOUS("Previous track", ActionCategory.SOUND),
    SOUND_SETTINGS("Sound & vibration settings", ActionCategory.SOUND),

    // Connections
    INTERNET_PANEL("Internet / Wi-Fi panel", ActionCategory.CONNECTIVITY),
    WIFI_SETTINGS("Wi-Fi settings", ActionCategory.CONNECTIVITY),
    BLUETOOTH_SETTINGS("Bluetooth settings", ActionCategory.CONNECTIVITY),
    MOBILE_NETWORK("Mobile network settings", ActionCategory.CONNECTIVITY),
    DATA_USAGE("Data usage", ActionCategory.CONNECTIVITY),
    HOTSPOT("Hotspot & tethering", ActionCategory.CONNECTIVITY),
    AIRPLANE_MODE("Airplane mode settings", ActionCategory.CONNECTIVITY),
    NFC("NFC settings", ActionCategory.CONNECTIVITY),
    VPN("VPN settings", ActionCategory.CONNECTIVITY),
    CAST("Cast screen", ActionCategory.CONNECTIVITY),
    LOCATION("Location settings", ActionCategory.CONNECTIVITY),

    // Settings pages
    SYSTEM_SETTINGS("All settings", ActionCategory.SETTINGS),
    DISPLAY_SETTINGS("Display & brightness", ActionCategory.SETTINGS),
    NIGHT_LIGHT("Night light / eye comfort", ActionCategory.SETTINGS),
    BATTERY("Battery usage", ActionCategory.SETTINGS),
    BATTERY_SAVER("Battery saver", ActionCategory.SETTINGS),
    STORAGE("Storage", ActionCategory.SETTINGS),
    APPS_SETTINGS("Apps", ActionCategory.SETTINGS),
    DEFAULT_APPS("Default apps", ActionCategory.SETTINGS),
    NOTIFICATION_SETTINGS("Notification settings", ActionCategory.SETTINGS),
    DND_SETTINGS("Do Not Disturb settings", ActionCategory.SETTINGS),
    SECURITY("Security & lock screen", ActionCategory.SETTINGS),
    PRIVACY("Privacy", ActionCategory.SETTINGS),
    ACCOUNTS("Accounts & sync", ActionCategory.SETTINGS),
    ACCESSIBILITY("Accessibility settings", ActionCategory.SETTINGS),
    LANGUAGE("Languages & input", ActionCategory.SETTINGS),
    KEYBOARD("Keyboard settings", ActionCategory.SETTINGS),
    DATE_TIME("Date & time", ActionCategory.SETTINGS),
    DEVELOPER_OPTIONS("Developer options", ActionCategory.SETTINGS),
    ABOUT_PHONE("About phone", ActionCategory.SETTINGS),
    HOME_APP("Default home app", ActionCategory.SETTINGS),

    // Apps & tools
    CAMERA("Camera", ActionCategory.APPS),
    SELFIE("Camera (selfie)", ActionCategory.APPS),
    VIDEO("Record video", ActionCategory.APPS),
    DIALER("Phone dialer", ActionCategory.APPS),
    ALARMS("Alarms", ActionCategory.APPS),
    TIMERS("Timers", ActionCategory.APPS),
    CALENDAR("Calendar", ActionCategory.APPS),
    WEB_BROWSER("Web browser", ActionCategory.APPS),
    PLAY_STORE("Play Store", ActionCategory.APPS),
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
    val longPress: GestureBinding = GestureBinding(ActionType.HOME_MENU),
    val twoFingerSwipeUp: GestureBinding = GestureBinding(ActionType.SEARCH),
    val twoFingerSwipeDown: GestureBinding = GestureBinding(ActionType.QUICK_SETTINGS),
    val twoFingerDoubleTap: GestureBinding = GestureBinding(ActionType.FLASHLIGHT),
    val pinchIn: GestureBinding = GestureBinding(ActionType.HOME_MENU),
    val pinchOut: GestureBinding = GestureBinding(ActionType.NONE),
    val homeButton: GestureBinding = GestureBinding(ActionType.FIRST_PAGE),
    val clockTap: GestureBinding = GestureBinding(ActionType.ALARMS),
    val dateTap: GestureBinding = GestureBinding(ActionType.CALENDAR),
    /** The drawer follows your finger when swipe-up opens it. */
    val swipeUpFollowsFinger: Boolean = true,
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
