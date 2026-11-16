# GlassDock

A free, open-source glass dock for Windows 10/11 with live widgets:
**pinned apps, calendar events, now playing, quick settings (Wi-Fi, Bluetooth, brightness…), network, a Yr weather forecast, clock + calendar, CPU, RAM, disk, battery, uptime, and Claude / ChatGPT / Grok usage limits.**

- Real Windows acrylic glass, in 5 styles (Glass, Frost, Midnight, Black, White)
- Floating pill or full width, on **any edge (top, bottom, left or right) of any monitor**, in 3 sizes
- Reserves its own screen space, so maximized windows don't cover it
- Can hide the Windows taskbar, which comes back as soon as you quit
- Hides itself when a game or video goes fullscreen
- Weather from [Open-Meteo](https://open-meteo.com): free, no account and no API key
- No accounts and no telemetry. The only network traffic is weather lookups.

## Quick settings

A Windows-style quick settings button on the dock (Wi-Fi, Bluetooth, volume and battery icons).
Click it for:

- **Wi-Fi** and **Bluetooth** switches that really turn the radios on and off. The › on each
  opens its Settings page. Cellular also appears on PCs that have it.
- **Brightness** (laptop screens; Windows has no standard control for most external monitors)
  and **volume** sliders. Scroll on them too.
- **Power mode:** Best efficiency, Balanced or Best performance.
- **Cast** (Win+K) and **Project** (Win+P).
- **Airplane mode, Night light, Do not disturb, Mobile hotspot, Nearby sharing, Accessibility,
  Energy saver** open their Settings pages. Windows doesn't let apps switch these directly.
- **Lock, Sleep, Restart, Shut down** (Restart and Shut down ask first), plus All settings.
- **Make it yours:** click ✎ (Edit) to drag tiles into any order, remove the ones you don't use
  (−) or add them back (+), and show or hide the brightness, volume and power mode rows.
  **Reset** puts everything back. You can also drag the dock's widgets themselves into any order.

## Network

- On the dock: a Wi-Fi signal icon (or Ethernet, or offline), the network name, and live
  download/upload speeds. An amber dot means you're connected but have no internet.
- Click it for the Network panel: signal strength, a live speed graph for the last 2 minutes,
  data used since GlassDock started, IP address and router (with copy buttons), link speed and
  adapter, plus buttons for Windows' **Wi-Fi networks** list and **Network settings**.
- VPN and virtual adapters (Tailscale, WireGuard, Hyper-V, WSL…) aren't counted twice in the
  speeds, and a wired connection is preferred when both are up, like Windows does.
- Windows 11 hides the Wi-Fi name from apps unless location access is on. The panel offers a
  button to allow it. Without it, the dock shows "Wi-Fi".

## Weather forecast from Yr

The weather widget uses **Yr** (by NRK and the Norwegian Meteorological Institute), the same
forecast as yr.no.

- On the dock: the current symbol and temperature, plus what's coming: **"Rain from 14:00"**
  when rain, sleet or snow is due in the next 6 hours, otherwise today's high and low.
- Click it for the Yr panel:
  - current conditions with wind (direction arrow and gusts), rain next hour and humidity
  - a **meteogram** for the next 24 or 48 hours: the temperature curve (red above 0°, blue
    below), rain bars in mm, and weather symbols
  - a **9-day forecast** with night, morning, afternoon and evening symbols, high and low,
    and rain per day
  - a link to the full forecast on yr.no
- Set your town in Settings → *Weather location*. °C/°F switches instantly. Wind shows in m/s
  (like Yr) with °C, or mph with °F.
- **MET Norway's terms:** GlassDock identifies itself, only downloads a new forecast after the
  current one expires, and credits Yr. MET asks apps to include contact details. You can add
  an email or website in Settings → *Contact for Yr / MET Norway*. It's optional and sent only
  to api.met.no.
- The older Open-Meteo weather widget is still available under right-click → Widgets.

## Calendar events

Add your Google, Outlook or iCloud calendar with its private **iCal link**. No sign-in needed.
Open the calendar (click the clock or the events widget) → ⚙ → paste the link → **Add**.
The panel explains where each service keeps the link:

- **Google Calendar** (web): Settings → your calendar → *Integrate calendar* → *Secret address in iCal format*.
- **Outlook / Microsoft 365**: Settings → Calendar → *Shared calendars* → *Publish a calendar* → *ICS* link.
- **iCloud**: Calendar app → share icon next to a calendar → *Public Calendar* → copy the link.

Then:

- The **dock** shows your next event with a countdown ("Design review · in 8m"), or **Now ·
  Sprint planning · until 10:45** during one. A **Join** button appears 10 minutes before
  events with a Google Meet, Teams, Zoom or Webex link.
- The **calendar panel** puts coloured dots on days with events, and lists the selected day's
  events with times, places and **Join** buttons.
- **Alerts** (on by default): a Windows notification 5 minutes before each event, with **Join**.
- Repeating events, moved or skipped occurrences, all-day and multi-day events, and time zones
  are all handled. Calendars refresh every 15 minutes (30 on battery saver) and are cached,
  so your events show even when you're offline.
- Keep the links private: anyone with one can read that calendar. GlassDock stores them only
  in its settings file on your PC.

## Now playing and volume

- **Now playing** shows what's playing in Spotify, a browser (YouTube, SoundCloud…) or any app that
  shows up in Windows' own media controls: album art, title, artist, play/pause and next/previous
  buttons, and a thin progress line. It hides itself when nothing is playing.
- **Volume** shows the current level. **Scroll** over it (or over Now playing) to change it, and
  **middle-click** to mute.
- **Click either one** for the Sound panel: big album art, a seek bar you can click, playback
  buttons, and a volume slider with mute.
- Both work through a small PowerShell helper that GlassDock starts once and keeps running. It
  uses the standard Windows audio and media services, nothing extra to install.

## Pin apps

- **Drag** any app, shortcut, file or folder from Explorer or the desktop onto the dock.
- Or click the **+** at the end of your apps, or right-click → **Pin apps…**. This shows every app
  in your Start menu, searchable and including Microsoft Store apps. Click one to pin or unpin it.
  **Browse for an app…** and **Pin a folder…** handle anything else.
- **Click** an icon to open it. **Drag** icons to reorder them. **Right-click** an icon to open its
  file location, move it or unpin it.
- **Running apps** get a dot under their icon. The dot is wider when the app has several windows,
  and becomes an accent-coloured bar for the app you're using. Clicking a running app switches to it
  instead of opening another copy. Click again to cycle its windows, or to minimize it if it has one.
  **Shift+click** or **middle-click** opens a new window. Right-click lists its windows so you can
  jump to one, close them, or open a new one. Pinned folders show as running when they're open
  in Explorer.
- **All open apps** (on by default): apps you haven't pinned also appear while they're open, after
  a thin divider and grouped one icon per program, so the dock can fully replace a hidden taskbar.
  They work the same way: click to switch, middle-click for a new window. Right-click shows their
  windows, **Pin to dock** and **Close**. Turn this off with right-click → **Show all open apps**.
- The **Start** button at the front opens the Windows Start menu, which is handy when the
  taskbar is hidden. Turn it off with right-click → **Show Start button**.
- Microsoft Store apps (Calculator, Photos, Settings…) show their real icons, read from the app's
  package. If one can't be found, the app's first letter is shown instead.

## Right-click menus

GlassDock draws its own glass menus to match the dock. They have icons, switches for on/off
options, and submenus that open in place with a back row. Arrow keys, Enter and Esc work too.

- **Right-click an empty part of the dock:** Task Manager, Show desktop, File Explorer and
  Windows Settings (the shortcuts the Windows taskbar has), then Pin apps, Widgets, Appearance,
  Position, Battery saver, **Lock the dock**, Hide Windows taskbar, Launch at startup,
  AI accounts, Settings, Hide dock and Quit.
- **Right-click an app**, pinned or open: a header with its icon, then its open windows (click one
  to jump to it), New window, **Run as administrator**, **Minimize / Restore all windows**,
  Close, **End task** (for apps that stopped responding; asks first), Open file location,
  Move left/right and Pin/Unpin.
- **Lock the dock** stops the dock, widgets and app icons from being dragged around by accident.
  It's also a switch in Settings.

The tray icon keeps the standard Windows menu.

## Battery saver

Right-click → **Battery saver**, or the **Off / Auto / On** switch in Settings. **Auto**, the
default, turns it on whenever your PC runs on battery. While it's on:

- Stats update every 10 s instead of 2 s, running apps every 5 s, AI usage every 5 min and
  website limits every 15 min.
- The live glass blur and all animations are off, so the GPU can rest. The dock switches to a
  solid version of your style.
- A small green leaf appears next to the battery widget, and the tray tooltip says it's on.

## Move the dock

Drag the **⋮⋮ grip** at the start of the dock (or any empty part of it) and let go near any edge
of any screen. The dock snaps to that edge. You can also right-click → **Position** / **Monitor**.
On the left and right edges the dock turns vertical.

## Claude, ChatGPT and Grok limits (website)

Right-click → **AI accounts → Connect claude.ai** (or chatgpt.com, grok.com). Sign in once in the window
that opens. It closes by itself when it can read your limits. The dock then shows your 5-hour
limit, and clicking it shows every limit (5-hour, weekly, per-model) with reset times.
These are the same numbers as the website's own usage page. They refresh every 5 minutes.

- Your sign-in is kept in GlassDock's own private browser storage, separate from your normal
  browser. It is only ever sent to that website. **Disconnect** in Settings erases it.
- These are the websites' internal endpoints, not official APIs, so a site update can break
  them. If that happens, the widget says "Couldn't read limits" instead of showing wrong numbers.
- ChatGPT doesn't report its per-model chat message caps. It shows the plan usage limits it does
  report, which are shared with Codex and agent features.
- Grok: grok.com also works when you're signed out, so the sign-in window can't tell when
  you're done. **Close it yourself** after signing in. Grok shows each model's queries left
  in its rolling window, e.g. "14 of 20 left".
- Gemini isn't supported: Google doesn't expose a usage counter for the Gemini app. It only
  tells you when you've hit a limit.
- If "Continue with Google" refuses to sign in inside the app, use email sign-in instead.

## AI usage widgets (local tools)

These widgets read the log files that the AI coding tools already write in your user folder.
They don't need keys or sign-in, and nothing is sent anywhere.

- **Claude Code**: tokens used in your current 5-hour window, with a countdown to the reset.
  It also shows today, the last 7 days, and which models you used. Anthropic doesn't publish
  exact plan limits, so this is your usage, not a percentage of your limit. To get a percentage,
  click the widget and set **My budget per 5 h** (for example `2m`).
  Logs are read from `%USERPROFILE%\.claude\projects`.
- **Codex (ChatGPT)**: your 5-hour and weekly limits as a percentage used. These are the
  numbers OpenAI sends to Codex CLI, taken from its latest session in `%USERPROFILE%\.codex\sessions`.
- **Gemini CLI**: requests made today, against a daily limit (1,000 by default, Google's free limit
  for signing in with a Google account; click the widget to change it). The count resets at
  midnight Pacific time, like Google's quota. Also shows tokens and models used.
  Logs are read from `%USERPROFILE%\.gemini\tmp`. Older Gemini CLI versions only log your
  prompts, so update it for full numbers.

Each widget hides itself if that tool isn't installed. You only see Claude Code, Codex or Gemini CLI
usage, not usage on the claude.ai or chatgpt.com websites.

## Run it

1. Install **Node.js LTS** from https://nodejs.org.
2. Open a terminal (PowerShell) in this folder and run:

   ```
   npm install
   npm start
   ```

The dock appears at the bottom of your screen.

## Tray icon

GlassDock puts an icon in the system tray, the notification area next to the Windows clock.

- **Click** it to hide or show the dock. Hiding the dock gives back its screen space, and brings
  the Windows taskbar back if you had hidden it, so you're never left without either.
  The dock stays hidden after a restart until you show it again.
- **Right-click** it for the same menu as the dock, plus **Show/Hide dock**.
- Starting GlassDock again while it's running also brings a hidden dock back.

If you've hidden the Windows taskbar, the tray isn't visible. Use the dock's right-click menu instead.

## Use it

| Do this | What happens |
|---|---|
| **Click** a widget | Opens its panel: calendar, weather forecast or system details |
| **Right-click** the dock | Widgets, style, size, position, shape, clock format, hide taskbar, launch at startup, quit |
| **Drag** a widget | Changes the widget order |
| Click **Weather → Set location** | Search for your city |

## Build an installer (.exe)

```
npm run dist
```

The installer is written to `dist\`. Use `npm run dist32` for 32-bit Windows.

## If the taskbar doesn't come back

GlassDock puts the taskbar back whenever it quits, even after a crash.
If the taskbar is still missing:

1. Start GlassDock again and untick **Hide Windows taskbar**, or
2. Turn off **Settings → Personalization → Taskbar → Taskbar behaviors →
   Automatically hide the taskbar**, then restart Explorer from Task Manager.

## Files

- `main.js`: windows, docking, taskbar handling, stats, weather and the right-click menu
- `src/win32.js`: small Win32 bindings (AppBar, taskbar, rounded corners) using koffi
- `renderer/`: the dock and panel UI (plain HTML, CSS and JS)

Settings are saved to `%APPDATA%\GlassDock\config.json`.
