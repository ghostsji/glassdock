# Canvas: a launcher you can make your own

Canvas is a full Android home-screen replacement where almost everything can be changed:
layout, look, gestures and behaviour. It's built natively in Kotlin + Jetpack Compose,
runs on Android 8.0 or newer, and has no ads, no tracking and no network access.

## Two versions

| | Canvas **Lite** | Canvas **Full** |
|---|---|---|
| Install from your phone (browser / Files) | ✅ | ❌ blocked by Play Protect* |
| Install from a computer (Android Studio / adb) | ✅ | ✅ |
| Everything else in this README | ✅ | ✅ |
| Notification badges | — | ✅ |
| Lock / recents / power menu / screenshot gestures | — | ✅ |

\* Play Protect's *enhanced fraud protection* blocks phone-sideloaded apps that declare
notification access or accessibility services, whatever they use them for. Installs over USB aren't affected.

Both builds share the same app id, so installing Full over Lite keeps your setup.

**From your phone:** every push to this branch builds both in GitHub Actions. Open the latest
*Build APK* run in a phone browser, download **Canvas-Lite**, unzip and tap the APK.

**Full, from a computer:** download **Canvas-Full**, unzip, plug in the phone (USB debugging on) and run
`adb install -r Canvas-Full.apk`, or press Run in Android Studio with the *fullDebug* build variant.

## Build & install (about 10 minutes the first time)

1. Install **Android Studio** (latest stable) from developer.android.com/studio.
2. **File → Open…** and pick this `CanvasLauncher` folder. Let Gradle sync finish.
   It downloads Gradle, the Android SDK and the libraries automatically.
   If Studio offers to upgrade the Android Gradle Plugin or Kotlin, say yes.
3. On your phone, turn on **Developer options → USB debugging**
   (Settings → About phone → tap *Build number* 7 times).
4. Plug the phone in, pick it in the device dropdown and press **Run ▶**.
   *No cable?* Use **Build → Build App Bundle(s)/APK(s) → Build APK(s)**, copy
   `app/build/outputs/apk/debug/app-debug.apk` to the phone and open it.
5. Open **Canvas Settings** from your app list. The setup card walks you through:
   - making Canvas your home screen (required)
   - turning on *Canvas gestures* (optional: double-tap to lock, recents, power menu, screenshot)
   - allowing notification badges (optional)

## What's in it

**Home screen**
- Multiple pages, a configurable grid (3–8 columns × 3–10 rows), edge margins, wallpaper dim
- Drag & drop with live cell highlight; drag to the screen edge to flip pages, or onto a new page
- Drop on another app to make a **folder**; drop on a folder to add to it; drop on an occupied cell to swap
- Drop zones while dragging: *Remove*, *App info*, *Uninstall*
- **Widgets**: picker with previews and search, resize & move, reconfigure, pinned widgets from apps
- **Pinned shortcuts**: "Add to home screen" from Chrome, Maps, Contacts and others, plus pin app shortcuts from the long-press menu
- Clock in 5 styles (large, stacked, compact, minimal, hidden), alignment, 12/24h; tap for alarms or calendar
- Search bar at the top, above the dock, or hidden; page indicator as dots, line, number or none
- Labels and status bar adapt automatically to light or dark wallpapers
- Lock layout to prevent accidental changes

**Dock:** 3–7 slots, pill / bar / no background, opacity, labels, and folders allowed in the dock.

**Icons:** 8 shapes (system, circle, squircle, rounded, square, teardrop, hexagon, pebble), size,
**icon packs** (any Nova/ADW-compatible pack), a per-app icon picker, **themed monochrome icons**
(Android 13+), work-profile badges, and label size/lines/colour.

**App drawer:** grid, list or text-only; A–Z, most used, or recently installed; an A–Z fast scroller
with a bubble; suggested apps; an instant search box; a personal/work profile filter; adjustable
opacity; pull down to close.

**Universal search:** apps (accents, word starts, initials such as "gm" → Google Maps, fuzzy typos),
app shortcuts, contacts, a calculator (tap to copy), a choice of 6 web engines, and Play Store search.

**Gestures (all reassignable):** swipe up/down, two-finger swipe up/down, double tap, home button,
and clock tap. Actions: drawer, search, notifications, quick settings, lock, recents, power menu,
screenshot, first page, settings, or open any app.

**Per-app:** rename, change the icon, hide, app shortcuts (long-press), app info, uninstall.

**Theme:** follow the system, light, dark, or pure-black AMOLED; Material You wallpaper colours or any
custom accent; 5 font families; a text-size scale; corner roundness; high contrast.

**Built for anyone:** one-tap presets (*Minimal, Large & easy, Power user, Focus, Classic phone*),
big touch targets and text scaling, high contrast, haptics on/off, animation speed, and a rotation lock.

**Backup & restore:** export your whole setup as a small JSON file, then import it on another phone
or share your look with a friend.

## Project map

```
app/src/main/java/dev/canvas/launcher/
  CanvasApp.kt            app-wide singletons
  LauncherActivity.kt     the home screen; widgets binding, home button, wallpaper colours
  SettingsActivity.kt     the "Canvas Settings" app
  AddItemActivity.kt      "Add to home screen" requests from other apps
  data/                   Config (every setting), Layout (pages/dock/folders + pure layout logic),
                          LauncherStore (JSON persistence, backup), Presets
  apps/                   AppRepository (apps, profiles, shortcuts), IconCache (rendering),
                          IconShapes, IconPacks
  system/                 Widgets host, notification Badges, accessibility actions, Calculator
  ui/                     HomeScreen, Drawer, Search, Sheets (menus/pickers/dialogs), Theme, ItemViews
  ui/settings/            settings screens and controls
```

**Adding a new setting:** add a field with a default to the right class in `data/Config.kt`, read it
in the UI through `LocalConfig.current`, and add a row in `ui/settings/SettingsScreen.kt`.
Old backups keep loading because unknown or missing fields fall back to defaults.

## Notes

- This project was written without access to the Android SDK, so it has **not been compiled yet**.
  The pure logic (layout, folders, drag & drop rules, reflow, calculator, search matching, presets)
  was compiled and passed 31 tests. If Android Studio flags anything on the first build, paste the
  error back to Claude and it can be fixed quickly.
- The release build is signed with the debug key so it installs straight away. Use your own
  signing key before publishing anywhere.
- Privacy: the accessibility service only performs global actions (lock, recents...) and cannot read
  the screen. The notification listener only counts notifications per app.
