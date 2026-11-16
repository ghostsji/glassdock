const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, nativeTheme, net, dialog, shell, powerMonitor, Notification } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { aiUsage } = require('./src/ai-usage');
const web = require('./src/web-limits');
const apps = require('./src/apps');
const calendar = require('./src/calendar');
const yr = require('./src/yr');

const IS_WIN = process.platform === 'win32';
let win32 = null;
let running = null;
let media = null;
if (IS_WIN) {
  try { win32 = require('./src/win32'); } catch (e) { console.error('Win32 helpers unavailable:', e); }
  try { running = require('./src/running'); } catch (e) { console.error('Running-app detection unavailable:', e); }
  try { media = require('./src/media'); } catch (e) { console.error('Media controls unavailable:', e); }
}

// ---------------------------------------------------------------- config
const SIZES = { S: 34, M: 42, L: 52 };   // dock height at the top/bottom
const VSIZES = { S: 54, M: 64, L: 76 };  // dock width at the left/right
const MARGIN = 8; // gap between a pill dock and the screen edge
const STYLES = {
  glass:    { label: 'Glass',    material: 'acrylic', theme: 'dark' },
  frost:    { label: 'Frost',    material: 'acrylic', theme: 'light' },
  midnight: { label: 'Midnight', material: 'acrylic', theme: 'dark' },
  black:    { label: 'Black',    material: 'none',    theme: 'dark' },
  white:    { label: 'White',    material: 'none',    theme: 'light' },
};
const WIDGETS = [
  { id: 'apps', label: 'Pinned apps' },
  { id: 'media', label: 'Now playing' },
  { id: 'network', label: 'Network' },
  { id: 'volume', label: 'Volume' },
  { id: 'events', label: 'Calendar events' },
  { id: 'yr', label: 'Weather forecast (Yr)' },
  { id: 'weather', label: 'Weather (Open-Meteo)' },
  { id: 'clock', label: 'Clock & calendar' },
  { id: 'cpu', label: 'CPU' },
  { id: 'ram', label: 'Memory' },
  { id: 'disk', label: 'Disk' },
  { id: 'battery', label: 'Battery' },
  { id: 'uptime', label: 'Uptime' },
  { id: 'claude', label: 'Claude Code usage' },
  { id: 'codex', label: 'Codex CLI limits' },
  { id: 'gemini', label: 'Gemini CLI usage' },
  { id: 'claude-web', label: 'Claude plan limits (claude.ai)' },
  { id: 'chatgpt-web', label: 'ChatGPT plan limits (chatgpt.com)' },
  { id: 'grok-web', label: 'Grok limits (grok.com)' },
];
const DEFAULTS = {
  edge: 'bottom',          // 'top' | 'bottom' | 'left' | 'right'
  displayId: null,         // which monitor (null = primary)
  layout: 'pill',          // 'pill' | 'full'
  style: 'glass',
  size: 'M',
  clock24: false,
  clockSeconds: false,
  units: 'celsius',        // 'celsius' | 'fahrenheit'
  location: null,          // { name, admin, country, lat, lon }
  hideTaskbar: false,
  widgets: ['apps', 'events', 'media', 'volume', 'network', 'yr', 'clock', 'cpu', 'ram', 'disk', 'battery', 'claude', 'codex', 'gemini', 'claude-web', 'chatgpt-web', 'grok-web'],
  web: { claude: false, chatgpt: false, grok: false }, // website accounts the user connected
  pinnedApps: [],          // [{ id, name, path } | { id, name, aumid }]
  showStart: true,         // Start button at the front of the apps group (Windows)
  showOpen: true,          // also show open apps that aren't pinned (Windows)
  dockHidden: false,       // hidden from the tray icon; the tray brings it back
  batterySaver: 'auto',    // 'off' | 'auto' (when on battery) | 'on'
  locked: false,           // stops dragging the dock, widgets and app icons around
  calendars: [],           // [{ id, url, name, color, enabled }]
  eventAlerts: true,       // notification 5 minutes before an event
  yrContact: '',           // optional email/website sent to MET Norway, as their terms ask
  claudeBudget: 0,         // optional: your own token budget per 5-hour window
  geminiDailyLimit: 1000,  // Gemini CLI requests per day (Google's free tier); 0 = no limit shown
  knownWidgets: [],        // lets new widgets switch on once after an update
};

const configPath = () => path.join(app.getPath('userData'), 'config.json');
let cfg = { ...DEFAULTS };

function loadConfig() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) }; } catch {}
  if (!STYLES[cfg.style]) cfg.style = DEFAULTS.style;
  if (!SIZES[cfg.size]) cfg.size = DEFAULTS.size;
  if (!['top', 'bottom', 'left', 'right'].includes(cfg.edge)) cfg.edge = 'bottom';
  if (!['off', 'auto', 'on'].includes(cfg.batterySaver)) cfg.batterySaver = 'auto';
  cfg.web = { ...DEFAULTS.web, ...(cfg.web || {}) };
  if (!Array.isArray(cfg.pinnedApps)) cfg.pinnedApps = [];
  if (!Array.isArray(cfg.calendars)) cfg.calendars = [];
  cfg.widgets = cfg.widgets.filter((id) => WIDGETS.some((w) => w.id === id));
  // The Yr forecast replaces the Open-Meteo weather widget in place, once. (The old one is
  // still in the Widgets menu.)
  if (!cfg.knownWidgets.includes('yr') && cfg.knownWidgets.length && !cfg.widgets.includes('yr')) {
    const i = cfg.widgets.indexOf('weather');
    if (i >= 0) cfg.widgets.splice(i, 1, 'yr');
  }
  // Turn on default widgets added since this config was saved (only once).
  for (const id of DEFAULTS.widgets) {
    if (!cfg.knownWidgets.includes(id) && !cfg.widgets.includes(id)) cfg.widgets.push(id);
  }
  cfg.knownWidgets = WIDGETS.map((w) => w.id);
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (e) { console.error('Could not save config:', e); }
}

// ---------------------------------------------------------------- state
let dock = null;
let popup = null;
let popupName = null;
let popupReady = false;
let popupHiddenAt = 0;
let dockHwnd = null;
let dockBounds = { x: 0, y: 0, width: 400, height: SIZES.M };
let contentSize = { w: 400, h: 400 };
let stats = null;
let weather = null;
let ai = null;
const appIcons = {}; // pinned app id -> icon (data URL)
let runningWins = {};  // pinned app id -> [window, ...]
let runningPublic = {}; // pinned app id -> { n, active } for the dock
let openGroups = new Map(); // key -> { key, exePath, aumid, wins } for unpinned open apps
let openPublic = [];        // what the dock draws for them
let openOrder = [];         // keys in first-seen order, so icons don't jump around
const openIcons = new Map(); // key -> data URL | null (null = no icon / still loading)
const webState = { claude: null, chatgpt: null, grok: null };
let webBusy = false;
let webLastRun = 0;
let taskbarTimer = null;
const cpuHistory = [];
const APPBAR_MSG = 0x8000 + 0x47; // WM_APP + n, our AppBar callback id

const publicState = () => ({
  config: cfg,
  widgets: WIDGETS,
  styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label])),
  stats,
  weather,
  ai,
  appIcons,
  network: netPublic,
  yr: yrPublic(),
  events: eventsPublic(),
  sound,
  saver: saverActive,
  running: { pinned: runningPublic, others: openPublic },
  version: app.getVersion(),
});

function broadcast(channel, data) {
  for (const w of [dock, popup]) if (w && !w.isDestroyed()) w.webContents.send(channel, data);
}

// ---------------------------------------------------------------- windows
function windowOptions(extra) {
  const style = STYLES[cfg.style];
  return {
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    // On Windows we use the real acrylic material; transparent windows can't have it.
    transparent: !IS_WIN,
    backgroundColor: '#00000000',
    ...(IS_WIN ? { backgroundMaterial: style.material } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    ...extra,
  };
}

function createDock() {
  dock = new BrowserWindow(windowOptions({
    width: dockBounds.width,
    height: SIZES[cfg.size],
    movable: false,
    alwaysOnTop: true,
    focusable: !IS_WIN, // on Windows: clicks work but never steal focus from your app
    title: 'GlassDock',
  }));
  dock.setAlwaysOnTop(true, 'pop-up-menu');
  dock.loadFile(path.join(__dirname, 'renderer', 'dock.html'));

  if (win32) {
    dockHwnd = win32.hwndFromBuffer(dock.getNativeWindowHandle());
    try { win32.appBarRegister(dockHwnd, APPBAR_MSG); } catch (e) { console.error(e); }
    dock.hookWindowMessage(APPBAR_MSG, (wParam, lParam) => {
      const code = wParam.readUInt32LE(0);
      if (code === 1 /* ABN_POSCHANGED */) layout();
      if (code === 2 /* ABN_FULLSCREENAPP */) {
        const fullscreen = lParam.readUInt32LE(0) !== 0;
        if (fullscreen) { dock.hide(); hidePopup(); } else if (!cfg.dockHidden) dock.showInactive();
      }
    });
  }

  dock.once('ready-to-show', () => applyDockVisibility());
  dock.on('closed', () => { dock = null; });
}

function createPopup() {
  popupReady = false;
  popup = new BrowserWindow(windowOptions({
    width: 320, height: 320,
    alwaysOnTop: true,
    title: 'GlassDock panel',
  }));
  popup.setAlwaysOnTop(true, 'pop-up-menu');
  popup.loadFile(path.join(__dirname, 'renderer', 'popup.html'));
  popup.webContents.once('did-finish-load', () => { popupReady = true; });
  popup.on('blur', hidePopup);
  popup.on('closed', () => { popup = null; });
  if (win32) win32.setRoundedCorners(win32.hwndFromBuffer(popup.getNativeWindowHandle()), true);
}

function hidePopup() {
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    popup.hide();
    popupHiddenAt = Date.now();
  }
}

const PANELS = {
  calendar: { w: 340, h: 600 },
  yr: { w: 400, h: 620 },
  network: { w: 340, h: 470 },
  weather: { w: 340, h: 430 },
  system: { w: 310, h: 300 },
  settings: { w: 330, h: 680 },
  ai: { w: 350, h: 560 },
  apps: { w: 350, h: 520 },
  sound: { w: 340, h: 360 },
};

// Place the panel beside the dock, on the side facing the middle of the screen,
// lined up with the widget that was clicked.
let panelAnchor = null;
function placePanel(w, h) {
  const anchor = panelAnchor;
  const area = screen.getDisplayMatching(dockBounds).bounds;
  const ax = dockBounds.x + (anchor && Number.isFinite(anchor.x) ? anchor.x : dockBounds.width / 2);
  const ay = dockBounds.y + (anchor && Number.isFinite(anchor.y) ? anchor.y : dockBounds.height / 2);
  let x, y;
  switch (cfg.edge) {
    case 'top': x = ax - w / 2; y = dockBounds.y + dockBounds.height + MARGIN; break;
    case 'left': x = dockBounds.x + dockBounds.width + MARGIN; y = ay - h / 2; break;
    case 'right': x = dockBounds.x - w - MARGIN; y = ay - h / 2; break;
    default: x = ax - w / 2; y = dockBounds.y - h - MARGIN;
  }
  x = Math.round(Math.max(area.x + MARGIN, Math.min(x, area.x + area.width - w - MARGIN)));
  y = Math.round(Math.max(area.y + MARGIN, Math.min(y, area.y + area.height - h - MARGIN)));
  popup.setBounds({ x, y, width: w, height: Math.round(h) });
}

function openPanel(name, anchor) {
  const spec = PANELS[name];
  if (!spec) return;
  if (cfg.dockHidden) setDockHidden(false);
  if (!popup || popup.isDestroyed()) createPopup();
  const visible = popup.isVisible();
  // Clicking the same widget again closes its panel (the blur may already have hidden it).
  if (popupName === name && (visible || Date.now() - popupHiddenAt < 300)) { hidePopup(); return; }
  popupName = name;
  if (name === 'ai') { refreshAi(); refreshWeb(false); }

  if (name === 'sound') pollSound(true);
  if (name === 'network') pollNet(true);
  if (name === 'yr') refreshYr(true);
  panelAnchor = anchor;
  placePanel(spec.w, spec.h);

  const show = () => {
    popup.webContents.send('panel', { name, ...publicState() });
    popup.show();
    popup.focus();
  };
  if (popupReady) show(); else popup.webContents.once('did-finish-load', show);
}

// ---------------------------------------------------------------- layout
const isVertical = () => cfg.edge === 'left' || cfg.edge === 'right';

function targetDisplay() {
  return screen.getAllDisplays().find((d) => d.id === cfg.displayId) || screen.getPrimaryDisplay();
}

function layout() {
  if (!dock || dock.isDestroyed() || dragTimer || cfg.dockHidden) return;
  const display = targetDisplay();
  const vertical = isVertical();
  const thick = vertical ? VSIZES[cfg.size] : SIZES[cfg.size]; // dock height (or width when vertical)
  const pill = cfg.layout === 'pill';
  const reserve = thick + (pill ? MARGIN * 2 : 0);

  // 1. Reserve a strip along the chosen edge (Windows moves other windows out of it).
  let strip = null;
  if (win32 && dockHwnd) {
    try {
      const phys = screen.dipToScreenRect(null, display.bounds);
      const rc = win32.appBarSetPos(dockHwnd, cfg.edge, {
        left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height,
      }, Math.round(reserve * display.scaleFactor));
      strip = screen.screenToDipRect(null, {
        x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top,
      });
    } catch (e) { console.error('AppBar positioning failed:', e); }
  }
  if (!strip) {
    const wa = display.workArea;
    strip = {
      top: { x: wa.x, y: wa.y, width: wa.width, height: reserve },
      bottom: { x: wa.x, y: wa.y + wa.height - reserve, width: wa.width, height: reserve },
      left: { x: wa.x, y: wa.y, width: reserve, height: wa.height },
      right: { x: wa.x + wa.width - reserve, y: wa.y, width: reserve, height: wa.height },
    }[cfg.edge];
  }

  // 2. Place the dock inside that strip.
  const gap = pill ? MARGIN : 0;
  let bounds;
  if (vertical) {
    const h = pill ? Math.min(Math.ceil(contentSize.h), strip.height - MARGIN * 2) : strip.height;
    bounds = {
      x: cfg.edge === 'left' ? strip.x + gap : strip.x + strip.width - gap - thick,
      y: Math.round(strip.y + (strip.height - h) / 2),
      width: thick, height: h,
    };
  } else {
    const w = pill ? Math.min(Math.ceil(contentSize.w), strip.width - MARGIN * 2) : strip.width;
    bounds = {
      x: Math.round(strip.x + (strip.width - w) / 2),
      y: cfg.edge === 'top' ? strip.y + gap : strip.y + strip.height - gap - thick,
      width: w, height: thick,
    };
  }
  dockBounds = bounds;
  dock.setBounds(bounds);
  if (win32 && dockHwnd) win32.setRoundedCorners(dockHwnd, pill);
}

// ---------------------------------------------------------------- drag the dock to any edge
let dragTimer = null;
let dragOffset = null;

function dragStart() {
  if (dragTimer || !dock) return;
  hidePopup();
  const pt = screen.getCursorScreenPoint();
  dragOffset = { x: pt.x - dockBounds.x, y: pt.y - dockBounds.y };
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    dock.setBounds({ ...dockBounds, x: p.x - dragOffset.x, y: p.y - dragOffset.y });
  }, 16);
}

function dragEnd() {
  if (!dragTimer) return;
  clearInterval(dragTimer);
  dragTimer = null;
  const pt = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(pt);
  const b = display.bounds;
  // Snap to whichever edge of that screen the pointer is closest to.
  const dist = {
    left: pt.x - b.x, right: b.x + b.width - pt.x,
    top: pt.y - b.y, bottom: b.y + b.height - pt.y,
  };
  const edge = Object.keys(dist).reduce((a, k) => (dist[k] < dist[a] ? k : a), 'bottom');
  setConfig({ edge, displayId: display.id });
}

function applyStyle() {
  const style = STYLES[cfg.style];
  nativeTheme.themeSource = style.theme; // tints the acrylic light or dark
  // Battery saver drops the live blur: it's the one thing here that keeps the GPU busy.
  const material = saverActive ? 'none' : style.material;
  if (IS_WIN) {
    for (const w of [dock, popup]) {
      if (w && !w.isDestroyed() && w.setBackgroundMaterial) w.setBackgroundMaterial(material);
    }
  }
}

// ---------------------------------------------------------------- taskbar
function applyTaskbar() {
  if (!win32) return;
  try {
    if (cfg.hideTaskbar) {
      if (cfg.savedTaskbarState == null) {
        cfg.savedTaskbarState = win32.getTaskbarState();
        saveConfig();
      }
      // Auto-hide frees the space the taskbar reserves, then we hide it entirely.
      win32.setTaskbarState(cfg.savedTaskbarState | win32.ABS_AUTOHIDE);
      win32.hideTaskbars();
      if (!taskbarTimer) taskbarTimer = setInterval(() => win32.hideTaskbars(), 1000);
    } else {
      restoreTaskbar();
    }
  } catch (e) { console.error('Taskbar change failed:', e); }
  setTimeout(layout, 400);
}

function restoreTaskbar() {
  if (!win32) return;
  clearInterval(taskbarTimer);
  taskbarTimer = null;
  try {
    if (cfg.savedTaskbarState != null) {
      win32.setTaskbarState(cfg.savedTaskbarState);
      delete cfg.savedTaskbarState;
      saveConfig();
    }
    win32.showTaskbars();
  } catch (e) { console.error('Taskbar restore failed:', e); }
}

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  restoreTaskbar();
  try { win32 && win32.appBarRemove(); } catch {}
  try { media && media.stop(); } catch {}
}

// ---------------------------------------------------------------- system stats
function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

let prevCpu = cpuTimes();
function sampleStats() {
  const now = cpuTimes();
  const dTotal = now.total - prevCpu.total;
  const cpu = dTotal > 0 ? Math.max(0, Math.min(100, 100 * (1 - (now.idle - prevCpu.idle) / dTotal))) : 0;
  prevCpu = now;
  cpuHistory.push(cpu);
  if (cpuHistory.length > 60) cpuHistory.shift();

  const memTotal = os.totalmem();
  const memUsed = memTotal - os.freemem();
  let disk = null;
  try {
    const root = IS_WIN ? `${process.env.SystemDrive || 'C:'}\\` : '/';
    const s = fs.statfsSync(root);
    disk = { label: IS_WIN ? (process.env.SystemDrive || 'C:') : '/', total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {}
  const cpus = os.cpus();
  stats = {
    cpu, cpuHistory: [...cpuHistory],
    cpuModel: cpus[0]?.model?.trim() || 'CPU', cores: cpus.length,
    memUsed, memTotal, disk, uptime: os.uptime(),
  };
  broadcast('stats', stats);
}

// ---------------------------------------------------------------- weather (Open-Meteo, free, no key)
async function getJson(url) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refreshWeather() {
  if (!cfg.location) { weather = null; broadcast('weather', null); return; }
  const { lat, lon } = cfg.location;
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', forecast_days: '7',
    temperature_unit: cfg.units, wind_speed_unit: cfg.units === 'fahrenheit' ? 'mph' : 'kmh',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
  });
  try {
    const data = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    weather = { ok: true, units: cfg.units, location: cfg.location, fetchedAt: Date.now(), data };
  } catch (e) {
    weather = { ok: false, error: String(e.message || e), location: cfg.location, data: weather?.data };
  }
  broadcast('weather', weather);
}

async function geocode(query) {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  return (data.results || []).map((r) => ({
    name: r.name, admin: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude, timezone: r.timezone || null,
  }));
}

// ---------------------------------------------------------------- AI usage (local logs)
function webPublic() {
  const out = {};
  for (const id of Object.keys(web.SERVICES)) out[id] = { connected: !!cfg.web[id], ...(webState[id] || { status: 'pending', windows: [] }) };
  return out;
}

function broadcastAi() {
  ai = { ...(ai || {}), web: webPublic() };
  broadcast('ai', ai);
}

function refreshAi() {
  ai = { ...aiUsage(), web: webPublic() };
  broadcast('ai', ai);
}

// Website limits: a hidden page per connected account, at most once a minute.
async function refreshWeb(force) {
  if (webBusy || (!force && Date.now() - webLastRun < 60 * 1000)) return;
  webBusy = true;
  webLastRun = Date.now();
  try {
    for (const id of Object.keys(web.SERVICES)) {
      if (!cfg.web[id]) continue;
      webState[id] = await web.fetchLimits(id);
      broadcastAi();
    }
  } finally {
    webBusy = false;
  }
}

async function connectWeb(id, url) {
  if (!web.SERVICES[id]) return;
  hidePopup();
  setConfig({ web: { ...cfg.web, [id]: true } });
  await web.openSignIn(id, url);
  webState[id] = await web.fetchLimits(id);
  broadcastAi();
}

async function disconnectWeb(id) {
  if (!web.SERVICES[id]) return;
  await web.signOut(id);
  webState[id] = null;
  setConfig({ web: { ...cfg.web, [id]: false } });
  broadcastAi();
}

// ---------------------------------------------------------------- pinned apps
async function loadAppIcons(list = cfg.pinnedApps) {
  for (const e of list) {
    if (appIcons[e.id] === undefined) appIcons[e.id] = await apps.iconFor(e);
  }
  broadcast('app-icons', appIcons);
}

function pinEntries(entries) {
  const list = [...cfg.pinnedApps];
  const added = [];
  for (const e of entries) {
    if (!e || list.some((x) => apps.sameTarget(x, e))) continue;
    list.push(e);
    added.push(e);
  }
  if (!added.length) return;
  if (!cfg.widgets.includes('apps')) setConfig({ widgets: ['apps', ...cfg.widgets] });
  setConfig({ pinnedApps: list });
  loadAppIcons(added);
}

function pinPaths(paths) {
  const ok = (Array.isArray(paths) ? paths : [])
    .filter((p) => typeof p === 'string' && p && path.isAbsolute(p) && fs.existsSync(p));
  pinEntries(ok.map(apps.entryForPath));
}

function unpinApp(id) {
  if (running) running.forget(id);
  setConfig({ pinnedApps: cfg.pinnedApps.filter((e) => e.id !== id) });
  delete appIcons[id];
}

// ---------------------------------------------------------------- running apps
function openName(g) {
  if (g.aumid) {
    const hit = (apps.cachedCatalog() || []).find((it) => it.aumid === g.aumid);
    if (hit) return hit.name;
    return g.aumid.split('!')[0].split('_')[0].split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  const base = path.win32.basename(g.exePath || '').replace(/\.exe$/i, '');
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'App';
}

function loadOpenIcon(g) {
  if (openIcons.has(g.key)) return;
  openIcons.set(g.key, null);
  const hit = g.aumid && (apps.cachedCatalog() || []).find((it) => it.aumid === g.aumid && it.icon);
  const p = hit ? Promise.resolve(hit.icon) : apps.iconFor({ aumid: g.aumid, path: g.exePath });
  p.then((icon) => {
    if (!icon) return;
    openIcons.set(g.key, icon);
    lastRunningJson = ''; // force the next poll to re-send
    pollRunning();
  }).catch(() => {});
}

let lastRunningJson = '';
function pollRunning() {
  if (!running || !dock || !dock.isVisible()) return;
  const onDock = cfg.widgets.includes('apps');
  const wantOthers = onDock && cfg.showOpen;
  const pinned = {};
  let others = [];
  if (onDock && (cfg.pinnedApps.length || wantOthers)) {
    try {
      const scan = running.runningFor(cfg.pinnedApps, wantOthers);
      runningWins = scan.result;
      for (const [id, wins] of Object.entries(scan.result)) {
        pinned[id] = { n: wins.length, active: wins.some((w) => w.hwnd === scan.foreground) };
      }
      openGroups = new Map(scan.others.map((g) => [g.key, g]));
      openOrder = openOrder.filter((k) => openGroups.has(k));
      for (const k of openGroups.keys()) if (!openOrder.includes(k)) openOrder.push(k);
      others = openOrder.map((k) => {
        const g = openGroups.get(k);
        loadOpenIcon(g);
        return {
          key: k, name: openName(g), icon: openIcons.get(k) || null, n: g.wins.length,
          title: g.wins[0].title, active: g.wins.some((w) => w.hwnd === scan.foreground),
        };
      });
    } catch (e) { console.error('Running-app scan failed:', e); runningWins = {}; openGroups = new Map(); }
  } else { runningWins = {}; openGroups = new Map(); }
  runningPublic = pinned;
  openPublic = others;
  const json = JSON.stringify([pinned, others]);
  if (json !== lastRunningJson) {
    lastRunningJson = json;
    broadcast('running', { pinned, others });
  }
}

// ---------------------------------------------------------------- network
let netPublic = null;
let netPrev = null;        // { at, counters: { id: { rx, tx } } }
const netHistory = [];     // [[down, up], ...] bytes/s, last 60 samples
let netBusy = false;
let netStartTotals = null; // counters when GlassDock started, for "used since startup"

// Virtual adapters (VPN clients, Hyper-V, WSL, VirtualBox, VMware, Bluetooth PAN) shouldn't be
// picked as "the" connection or counted twice in the speeds.
const VIRTUAL = /virtual|vmware|hyper-v|vethernet|wsl|vbox|virtualbox|loopback|bluetooth|tap-|wintun|wireguard|tailscale|zerotier|npcap|teredo|isatap|pseudo/i;

function pickPrimary(adapters) {
  const real = adapters.filter((a) => !VIRTUAL.test(`${a.name} ${a.desc}`));
  const withGw = real.filter((a) => a.gateway && a.gateway.length);
  // Windows prefers a wired connection when both are up
  return withGw.find((a) => a.type === 'Ethernet') || withGw[0] || real[0] || adapters[0] || null;
}

function netWanted() {
  return media && !media.isDisabled() && dock && dock.isVisible() && (cfg.widgets.includes('network') || popupName === 'network');
}

async function pollNet(force = false) {
  if (netBusy || (!force && !netWanted()) || !media || media.isDisabled()) return;
  netBusy = true;
  try {
    const msg = await media.call('net');
    const n = msg && msg.net;
    if (!n) return;
    const adapters = Array.isArray(n.adapters) ? n.adapters : [];
    const now = Date.now();
    const counters = Object.fromEntries(adapters.map((a) => [a.id, { rx: a.rx, tx: a.tx }]));
    let down = 0, up = 0;
    if (netPrev && now > netPrev.at) {
      const dt = (now - netPrev.at) / 1000;
      for (const a of adapters) {
        const p = netPrev.counters[a.id];
        if (!p || VIRTUAL.test(`${a.name} ${a.desc}`)) continue;
        // counters can reset (adapter restarted): ignore negative steps
        down += Math.max(0, a.rx - p.rx) / dt;
        up += Math.max(0, a.tx - p.tx) / dt;
      }
      netHistory.push([Math.round(down), Math.round(up)]);
      if (netHistory.length > 60) netHistory.shift();
    }
    netPrev = { at: now, counters };
    const real = adapters.filter((a) => !VIRTUAL.test(`${a.name} ${a.desc}`));
    const totals = { rx: real.reduce((t, a) => t + a.rx, 0), tx: real.reduce((t, a) => t + a.tx, 0) };
    if (!netStartTotals) netStartTotals = totals;
    const primary = pickPrimary(adapters);
    const wifi = primary && primary.type === 'Wireless80211' ? n.wifi : null;
    const type = !primary ? 'none' : primary.type === 'Wireless80211' ? 'wifi'
      : /Ethernet|GigabitEthernet|FastEthernet/i.test(primary.type) ? 'ethernet'
        : /Wwan|Ppp/i.test(primary.type) ? 'cellular' : 'other';
    netPublic = {
      online: net.isOnline() && !!(primary && primary.gateway && primary.gateway.length),
      type,
      name: wifi && wifi.ssid ? wifi.ssid : primary ? (type === 'ethernet' ? 'Ethernet' : primary.name) : 'Not connected',
      signal: wifi && Number.isFinite(wifi.signal) ? wifi.signal : null,
      nameHidden: !!(wifi && wifi.locationBlocked),
      ip: primary && primary.ipv4 && primary.ipv4[0] || null,
      gateway: primary && primary.gateway && primary.gateway[0] || null,
      linkSpeed: primary ? primary.speed : null,
      adapter: primary ? primary.desc : null,
      down, up,
      history: [...netHistory],
      session: { rx: Math.max(0, totals.rx - netStartTotals.rx), tx: Math.max(0, totals.tx - netStartTotals.tx) },
      others: adapters.filter((a) => a !== primary).map((a) => ({ name: a.name, desc: a.desc, ip: a.ipv4 && a.ipv4[0] || null })),
    };
    broadcast('network', netPublic);
  } catch { /* helper starting up */ } finally { netBusy = false; }
}

// ---------------------------------------------------------------- Yr forecast (MET Norway)
let yrData = null;   // last good forecast (includes MET's raw data for If-Modified-Since)
let yrError = null;
let yrBusy = false;

function yrPublic() {
  if (!cfg.location) return { status: 'no-location' };
  if (!yrData) return { status: yrError ? 'error' : 'loading', error: yrError };
  return {
    status: yrError ? 'stale' : 'ok', error: yrError, location: cfg.location,
    updatedAt: yrData.updatedAt, fetchedAt: yrData.fetchedAt, hours: yrData.hours, days: yrData.days,
  };
}

async function refreshYr(force = false) {
  if (yrBusy || !cfg.location) { broadcast('yr', yrPublic()); return; }
  if (!force && !(cfg.widgets.includes('yr') || popupName === 'yr')) return;
  yrBusy = true;
  try {
    const prev = force && yrData ? { ...yrData, expires: 0 } : yrData;
    yrData = await yr.fetchForecast({
      lat: cfg.location.lat, lon: cfg.location.lon,
      timeZone: cfg.location.timezone || undefined,
      version: app.getVersion(), contact: cfg.yrContact, prev,
      fetchImpl: (url, opts) => net.fetch(url, opts),
    });
    yrError = null;
  } catch (e) {
    yrError = String(e.message || e);
  } finally { yrBusy = false; }
  broadcast('yr', yrPublic());
}

// ---------------------------------------------------------------- calendar events (iCal links)
const calState = {};   // calendar id -> { status: 'loading'|'ok'|'error', error, fetchedAt, events }
const calCachePath = () => path.join(app.getPath('userData'), 'calendar-cache.json');

function eventsPublic() {
  const enabled = new Set(cfg.calendars.filter((c) => c.enabled !== false).map((c) => c.id));
  const events = [];
  for (const c of cfg.calendars) if (enabled.has(c.id)) events.push(...((calState[c.id] && calState[c.id].events) || []));
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    calendars: cfg.calendars.map((c) => {
      const st = calState[c.id] || {};
      return { id: c.id, name: c.name, color: c.color, enabled: c.enabled !== false, url: c.url,
        status: st.status || 'loading', error: st.error || null, fetchedAt: st.fetchedAt || null, count: (st.events || []).length };
    }),
    events,
  };
}
const broadcastEvents = () => broadcast('events', eventsPublic());

async function fetchText(url) {
  const res = await net.fetch(url, { headers: { accept: 'text/calendar, */*' } });
  if (!res.ok) throw new Error(res.status === 404 ? "That calendar link wasn't found (404). It may have been reset." : `The calendar server answered ${res.status}.`);
  return res.text();
}

async function refreshCalendar(c) {
  calState[c.id] = { ...(calState[c.id] || {}), status: (calState[c.id] && calState[c.id].events) ? 'ok' : 'loading' };
  try {
    const res = await calendar.loadCalendar(c, fetchText);
    calState[c.id] = { status: 'ok', error: null, fetchedAt: Date.now(), events: res.events };
    return res;
  } catch (e) {
    // keep showing the last good copy
    calState[c.id] = { ...(calState[c.id] || {}), status: 'error', error: String(e.message || e) };
    return null;
  }
}

let calBusy = false;
async function refreshCalendars() {
  if (calBusy || !cfg.calendars.length) return;
  calBusy = true;
  try {
    await Promise.all(cfg.calendars.filter((c) => c.enabled !== false).map(refreshCalendar));
    saveCalendarCache();
  } finally { calBusy = false; }
  broadcastEvents();
}

function saveCalendarCache() {
  try {
    const data = Object.fromEntries(Object.entries(calState).filter(([, v]) => v.events).map(([k, v]) => [k, { fetchedAt: v.fetchedAt, events: v.events }]));
    fs.writeFileSync(calCachePath(), JSON.stringify(data));
  } catch {}
}
function loadCalendarCache() {
  try {
    const data = JSON.parse(fs.readFileSync(calCachePath(), 'utf8'));
    for (const c of cfg.calendars) if (data[c.id]) calState[c.id] = { status: 'ok', fetchedAt: data[c.id].fetchedAt, events: data[c.id].events };
  } catch {}
}

async function addCalendar(input) {
  const url = calendar.normaliseUrl(input);
  if (!url) return { ok: false, error: 'Paste a link that starts with https:// or webcal://.' };
  if (cfg.calendars.some((c) => c.url === url)) return { ok: false, error: 'That calendar is already added.' };
  const id = apps.newId();
  const used = new Set(cfg.calendars.map((c) => c.color));
  const color = calendar.COLORS.find((col) => !used.has(col)) || calendar.COLORS[cfg.calendars.length % calendar.COLORS.length];
  const cal = { id, url, name: 'Calendar', color, enabled: true };
  const res = await refreshCalendar(cal);
  if (!res) { const err = calState[id].error; delete calState[id]; return { ok: false, error: err }; }
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  cal.name = res.name || (/google/.test(host) ? 'Google Calendar' : /outlook|office|live/.test(host) ? 'Outlook' : /icloud/.test(host) ? 'iCloud' : host || 'Calendar');
  setConfig({ calendars: [...cfg.calendars, cal] });
  saveCalendarCache();
  broadcastEvents();
  return { ok: true };
}

function updateCalendar(id, patch) {
  const allowed = {};
  if (typeof patch.enabled === 'boolean') allowed.enabled = patch.enabled;
  if (typeof patch.name === 'string' && patch.name.trim()) allowed.name = patch.name.trim().slice(0, 60);
  if (calendar.COLORS.includes(patch.color)) allowed.color = patch.color;
  setConfig({ calendars: cfg.calendars.map((c) => (c.id === id ? { ...c, ...allowed } : c)) });
  if (allowed.enabled) { const c = cfg.calendars.find((x) => x.id === id); if (c && !calState[id]) refreshCalendar(c).then(broadcastEvents); }
  broadcastEvents();
}

function removeCalendar(id) {
  delete calState[id];
  setConfig({ calendars: cfg.calendars.filter((c) => c.id !== id) });
  saveCalendarCache();
  broadcastEvents();
}

// A heads-up 5 minutes before each timed event (once per event).
const alerted = new Set();
function checkEventAlerts() {
  if (!cfg.eventAlerts || !Notification.isSupported()) return;
  const now = Date.now();
  for (const e of eventsPublic().events) {
    if (e.allDay || alerted.has(e.key)) continue;
    const lead = e.start - now;
    if (lead > 5 * 60 * 1000 || lead < -60 * 1000) continue;
    alerted.add(e.key);
    const cal = cfg.calendars.find((c) => c.id === e.calId);
    const when = lead > 30 * 1000 ? `in ${Math.max(1, Math.round(lead / 60000))} min` : 'now';
    const n = new Notification({
      title: e.title,
      body: [`Starts ${when}`, e.location, cal && cal.name].filter(Boolean).join(' · '),
      silent: false,
      actions: e.link ? [{ type: 'button', text: 'Join' }] : [],
    });
    const join = () => { if (e.link) shell.openExternal(e.link); else openPanel('calendar'); };
    n.on('click', join);
    n.on('action', join);
    n.show();
  }
}

// ---------------------------------------------------------------- volume + media
let sound = null;      // { volume: { level, muted }, media: {...} | null }
let soundJson = '';
let soundThumb = { key: null, src: null };
let soundBusy = false;

const MEDIA_APPS = {
  '308046b0af4a39cb': 'Firefox', 'f0dc299d809b9700': 'Zen', chrome: 'Chrome', msedge: 'Edge',
  'spotify.exe': 'Spotify', spotify: 'Spotify', 'vlc.exe': 'VLC', brave: 'Brave', opera: 'Opera',
};
function mediaAppName(id) {
  if (!id) return '';
  const known = MEDIA_APPS[id.toLowerCase()];
  if (known) return known;
  if (id.includes('!')) {
    const hit = (apps.cachedCatalog() || []).find((it) => it.aumid && it.aumid.toLowerCase() === id.toLowerCase());
    if (hit) return hit.name;
    return id.split('!')[0].split('_')[0].split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  const base = id.replace(/\.exe$/i, '').split(/[\\/]/).pop();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function soundWanted() {
  return media && !media.isDisabled() && dock && dock.isVisible()
    && (cfg.widgets.includes('volume') || cfg.widgets.includes('media') || popupName === 'sound');
}

function takeSound(msg) {
  if (!msg) return;
  let m = msg.media || null;
  if (m) {
    // the helper only sends artwork when the track changes; keep it here
    if (m.thumbIncluded) soundThumb = { key: m.key, src: m.thumb || null };
    m = { ...m, thumb: soundThumb.key === m.key ? soundThumb.src : null, appName: mediaAppName(m.app) };
    delete m.thumbIncluded;
  }
  const next = { volume: msg.volume || null, media: m };
  const json = JSON.stringify(next);
  if (json !== soundJson) {
    soundJson = json;
    sound = next;
    broadcast('sound', sound);
  }
}

async function pollSound(force = false) {
  if (soundBusy || (!force && !soundWanted()) || !media || media.isDisabled()) return;
  soundBusy = true;
  try {
    const needThumb = !!(sound && sound.media && soundThumb.key !== sound.media.key);
    takeSound(await media.call('state', needThumb));
  } catch (e) { /* helper starting up or restarting */ }
  soundBusy = false;
}

async function soundCommand(cmd, arg) {
  if (!media || media.isDisabled()) return;
  try { takeSound(await media.call(cmd, arg)); } catch (e) { console.error('Media command failed:', e.message); }
  // apps take a moment to report the new state
  setTimeout(() => pollSound(true), 350);
  setTimeout(() => pollSound(true), 1200);
}

// ---------------------------------------------------------------- open (unpinned) apps
function launchOpenNew(g) {
  if (g.aumid) apps.launch({ name: openName(g), aumid: g.aumid });
  else if (g.exePath) shell.openPath(g.exePath);
  setTimeout(pollRunning, 1200);
}

function focusOpen(key, opts = {}) {
  const g = openGroups.get(key);
  if (!g || !running) return;
  if (opts.newInstance) { launchOpenNew(g); return; }
  running.activate(g.wins);
  setTimeout(pollRunning, 150);
}

function showOpenMenu(key) {
  const g = openGroups.get(key);
  if (!g || !running) return;
  const name = openName(g);
  const { list, actions } = windowMenuItems(name, g.wins);
  const exe = g.aumid ? null : g.exePath;
  showMenu([
    ...list,
    { label: 'New window', glyph: 'plus', click: () => launchOpenNew(g) },
    ...(canRunAsAdmin(exe) ? [{ label: 'Run as administrator', glyph: 'shield', click: () => runAsAdmin(exe) }] : []),
    { type: 'separator' },
    ...actions,
    ...(exe ? [{ label: 'Open file location', glyph: 'folder', click: () => shell.showItemInFolder(exe) }] : []),
    {
      label: 'Pin to dock', glyph: 'pin',
      click: () => {
        const entry = g.aumid
          ? { id: apps.newId(), name, aumid: g.aumid }
          : { id: apps.newId(), name, path: g.exePath };
        if (openIcons.get(key)) appIcons[entry.id] = openIcons.get(key);
        pinEntries([entry]);
        setTimeout(pollRunning, 100);
      },
    },
  ], { title: name, icon: openIcons.get(key) || null, sub: `${g.wins.length} window${g.wins.length > 1 ? 's' : ''} open` });
}

async function launchApp(id, opts = {}) {
  const entry = cfg.pinnedApps.find((e) => e.id === id);
  if (!entry) return;
  if (running && !opts.newInstance) {
    let wins = null;
    try { wins = running.runningFor([entry]).result[id]; } catch {}
    if (wins && wins.length) {
      running.activate(wins);
      setTimeout(pollRunning, 150);
      return;
    }
  }
  setTimeout(pollRunning, 1200);
  setTimeout(pollRunning, 4000);
  const err = await apps.launch(entry);
  if (err) {
    const { response } = await dialog.showMessageBox({
      type: 'warning', title: 'GlassDock', message: `Couldn't open ${entry.name}`, detail: err,
      buttons: ['Unpin it', 'Keep'], defaultId: 1, cancelId: 1,
    });
    if (response === 0) unpinApp(id);
  }
}

// ---------------------------------------------------------------- custom (glass) menus
// Menus are described with the same template objects Electron uses (label, type, checked,
// enabled, submenu, click), plus `glyph` (icon name) and `danger` (red). The popup window
// draws them; clicks come back here by id. The tray still uses native menus.
let menuActions = new Map();
let menuSeq = 0;
let menuAnchor = null;
const MENU_W = 264;

function serializeMenu(items) {
  const out = [];
  for (const it of items || []) {
    if (!it) continue;
    if (it.type === 'separator') {
      if (out.length && out[out.length - 1].type !== 'separator') out.push({ type: 'separator' });
      continue;
    }
    const id = ++menuSeq;
    if (it.click) menuActions.set(id, it.click);
    out.push({
      id, label: it.label, type: it.type || 'normal', checked: !!it.checked, enabled: it.enabled !== false,
      glyph: it.glyph || null, danger: !!it.danger, submenu: it.submenu ? serializeMenu(it.submenu) : null,
    });
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop();
  return out;
}

function showMenu(items, header = null) {
  if (!popup || popup.isDestroyed()) createPopup();
  menuActions = new Map();
  const menu = { items: serializeMenu(items), header };
  const pt = screen.getCursorScreenPoint();
  menuAnchor = { x: pt.x, y: pt.y };
  popupName = 'menu';
  placeMenu(estimateMenuHeight(menu.items, header));
  const show = () => {
    popup.webContents.send('panel', { name: 'menu', menu, ...publicState() });
    popup.show();
    popup.focus();
  };
  if (popupReady) show(); else popup.webContents.once('did-finish-load', show);
}

function estimateMenuHeight(items, header) {
  return 12 + (header ? 44 : 0) + items.reduce((h, it) => h + (it.type === 'separator' ? 9 : 30), 0);
}

// Next to the dock, lined up with the pointer, never covering the dock.
function placeMenu(height) {
  if (!popup || !menuAnchor) return;
  const area = screen.getDisplayNearestPoint(menuAnchor).workArea;
  const h = Math.min(Math.ceil(height), area.height - MARGIN * 2);
  const clampX = (x) => Math.round(Math.max(area.x + MARGIN, Math.min(x, area.x + area.width - MENU_W - MARGIN)));
  const clampY = (y) => Math.round(Math.max(area.y + MARGIN, Math.min(y, area.y + area.height - h - MARGIN)));
  let x, y;
  switch (cfg.edge) {
    case 'top': x = clampX(menuAnchor.x - 24); y = clampY(dockBounds.y + dockBounds.height + 6); break;
    case 'left': x = dockBounds.x + dockBounds.width + 6; y = clampY(menuAnchor.y - 24); break;
    case 'right': x = dockBounds.x - MENU_W - 6; y = clampY(menuAnchor.y - 24); break;
    default: x = clampX(menuAnchor.x - 24); y = clampY(dockBounds.y - h - 6);
  }
  popup.setBounds({ x, y, width: MENU_W, height: h });
}

ipcMain.on('menu-pick', (_e, id) => {
  const fn = menuActions.get(id);
  hidePopup();
  if (fn) setTimeout(fn, 10); // let the menu disappear first
});
ipcMain.on('menu-size', (_e, h) => { if (popupName === 'menu' && Number.isFinite(h)) placeMenu(h); });

// ---------------------------------------------------------------- app right-click actions
const canRunAsAdmin = (p) => IS_WIN && !!p && /\.(exe|lnk|bat|cmd)$/i.test(p);

function runAsAdmin(target) {
  // The path goes in through an environment variable, so no quoting can break the command.
  execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', 'Start-Process -FilePath $env:GD_TARGET -Verb RunAs'],
    { env: { ...process.env, GD_TARGET: target }, windowsHide: true }, () => {});
}

async function endTask(name, wins) {
  const pids = [...new Set((wins || []).map((w) => w.pid).filter(Boolean))];
  if (!pids.length) return;
  const { response } = await dialog.showMessageBox({
    type: 'warning', title: 'GlassDock', message: `End ${name}?`,
    detail: 'Anything unsaved in it will be lost. Use this when the app has stopped responding.',
    buttons: ['End task', 'Cancel'], defaultId: 1, cancelId: 1,
  });
  if (response !== 0) return;
  const failed = [];
  for (const pid of pids) { try { process.kill(pid); } catch { failed.push(pid); } }
  if (failed.length) {
    dialog.showErrorBox('GlassDock', `Couldn't end ${name}. It may be running as administrator; use Task Manager instead.`);
  }
  setTimeout(pollRunning, 800);
}

// Window list + window actions, shared by pinned and open apps.
function windowMenuItems(name, wins) {
  if (!wins.length) return { list: [], actions: [] };
  const list = [
    ...wins.slice(0, 10).map((w) => ({
      label: w.title.length > 60 ? `${w.title.slice(0, 57)}…` : w.title, glyph: 'window',
      click: () => running.focusWindow(w.hwnd),
    })),
    ...(wins.length > 10 ? [{ label: `…and ${wins.length - 10} more`, enabled: false }] : []),
    { type: 'separator' },
  ];
  const many = wins.length > 1;
  const actions = [
    { glyph: 'minimize', label: many ? 'Minimize all windows' : 'Minimize', click: () => running.minimizeWindows(wins) },
    { glyph: 'restore', label: many ? 'Restore all windows' : 'Restore', click: () => running.restoreWindows(wins) },
    {
      glyph: 'close', label: many ? `Close all ${wins.length} windows` : 'Close window',
      click: () => { running.closeWindows(wins); setTimeout(pollRunning, 800); },
    },
    { label: 'End task', glyph: 'stop', danger: true, click: () => endTask(name, wins) },
    { type: 'separator' },
  ];
  return { list, actions };
}

function showAppMenu(id) {
  const entry = cfg.pinnedApps.find((e) => e.id === id);
  if (!entry) return;
  const i = cfg.pinnedApps.indexOf(entry);
  const move = (d) => {
    const list = [...cfg.pinnedApps];
    list.splice(i, 1);
    list.splice(i + d, 0, entry);
    setConfig({ pinnedApps: list });
  };
  const wins = runningWins[id] || [];
  const { list, actions } = windowMenuItems(entry.name, wins);
  showMenu([
    ...list,
    wins.length
      ? { label: 'New window', glyph: 'plus', click: () => launchApp(id, { newInstance: true }) }
      : { label: `Open ${entry.name}`, glyph: 'open', click: () => launchApp(id) },
    ...(canRunAsAdmin(entry.path) ? [{ label: 'Run as administrator', glyph: 'shield', click: () => runAsAdmin(entry.path) }] : []),
    { type: 'separator' },
    ...actions,
    ...(entry.path ? [{ label: 'Open file location', glyph: 'folder', click: () => shell.showItemInFolder(entry.path) }] : []),
    ...(cfg.locked ? [] : [
      { glyph: isVertical() ? 'up' : 'left', label: isVertical() ? 'Move up' : 'Move left', enabled: i > 0, click: () => move(-1) },
      { glyph: isVertical() ? 'down' : 'right', label: isVertical() ? 'Move down' : 'Move right', enabled: i < cfg.pinnedApps.length - 1, click: () => move(1) },
    ]),
    { type: 'separator' },
    { label: 'Unpin from dock', glyph: 'unpin', click: () => unpinApp(id) },
  ], { title: entry.name, icon: appIcons[id] || null, sub: wins.length ? `${wins.length} window${wins.length > 1 ? 's' : ''} open` : 'Pinned' });
}

async function pinWithDialog(kind) {
  hidePopup();
  const res = await dialog.showOpenDialog({
    title: kind === 'folder' ? 'Pin a folder' : 'Pin an app or file',
    properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
    filters: kind === 'folder' ? [] : [
      { name: 'Apps and shortcuts', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd', 'appref-ms'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (!res.canceled) pinPaths(res.filePaths);
}

async function appCatalog() {
  const items = await apps.getCatalog();
  return items.map((it) => ({
    key: it.key, name: it.name, icon: it.icon,
    pinned: cfg.pinnedApps.some((e) => apps.sameTarget(e, it)),
  }));
}

function toggleCatalogApp(key) {
  const it = apps.catalogItem(key);
  if (!it) return;
  const existing = cfg.pinnedApps.find((e) => apps.sameTarget(e, it));
  if (existing) { unpinApp(existing.id); return; }
  const entry = { id: apps.newId(), name: it.name, ...(it.aumid ? { aumid: it.aumid } : { path: it.path }) };
  if (it.icon) appIcons[entry.id] = it.icon; // reuse the picker's icon right away
  pinEntries([entry]);
}

// ---------------------------------------------------------------- config changes
function setConfig(patch) {
  const prev = cfg;
  cfg = { ...cfg, ...patch };
  saveConfig();
  broadcast('config', cfg);
  if (patch.style && patch.style !== prev.style) applyStyle();
  if ('hideTaskbar' in patch && patch.hideTaskbar !== prev.hideTaskbar && !cfg.dockHidden) applyTaskbar();
  if ('dockHidden' in patch && patch.dockHidden !== prev.dockHidden) applyDockVisibility();
  if ('batterySaver' in patch && patch.batterySaver !== prev.batterySaver) applySaver();
  if (tray && trayMenu && !IS_WIN) tray.setContextMenu(trayMenu());
  if (['edge', 'layout', 'size', 'displayId'].some((k) => k in patch) && !cfg.dockHidden) { hidePopup(); layout(); }
  if (('location' in patch && JSON.stringify(patch.location) !== JSON.stringify(prev.location))
      || (patch.units && patch.units !== prev.units)) refreshWeather();
  if ('location' in patch && JSON.stringify(patch.location) !== JSON.stringify(prev.location)) { yrData = null; yrError = null; refreshYr(true); }
  if (('units' in patch && patch.units !== prev.units) || 'yrContact' in patch) broadcast('yr', yrPublic());
  if ('widgets' in patch && patch.widgets.includes('yr') && !prev.widgets.includes('yr')) refreshYr();
}

function toggleWidget(id) {
  const has = cfg.widgets.includes(id);
  setConfig({ widgets: has ? cfg.widgets.filter((w) => w !== id) : [...cfg.widgets, id] });
}

function showContextMenu() {
  const items = menuTemplate();
  if (tray) items.splice(items.length - 1, 0, { label: 'Hide dock', glyph: 'eye', click: () => setDockHidden(true) });
  showMenu(items);
}

function menuTemplate() {
  const radio = (label, key, value) => ({
    label, type: 'radio', checked: cfg[key] === value, click: () => setConfig({ [key]: value }),
  });
  const check = (label, key, extra = {}) => ({
    label, type: 'checkbox', checked: !!cfg[key], click: () => setConfig({ [key]: !cfg[key] }), ...extra,
  });
  const login = app.getLoginItemSettings();
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  const start = (cmd) => () => spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
  return [
    // the Windows taskbar's own shortcuts
    ...(IS_WIN ? [
      { label: 'Task Manager', glyph: 'pulse', click: start('taskmgr.exe') },
      { label: 'Show desktop', glyph: 'desktop', click: () => { try { win32.showDesktop(); } catch {} } },
      { label: 'File Explorer', glyph: 'folder', click: start('explorer.exe') },
      { label: 'Windows Settings', glyph: 'gear', click: () => shell.openExternal('ms-settings:') },
      { type: 'separator' },
    ] : []),
    { label: 'Pin apps…', glyph: 'pin', click: () => openPanel('apps') },
    ...(IS_WIN ? [
      check('Show all open apps', 'showOpen', { glyph: 'apps', click: () => { setConfig({ showOpen: !cfg.showOpen }); setTimeout(pollRunning, 50); } }),
      check('Show Start button', 'showStart', { glyph: 'start' }),
    ] : []),
    {
      label: 'Widgets', glyph: 'grid',
      submenu: WIDGETS.map((w) => ({
        label: w.label, type: 'checkbox', checked: cfg.widgets.includes(w.id), click: () => toggleWidget(w.id),
      })),
    },
    { type: 'separator' },
    {
      label: 'Appearance', glyph: 'brush',
      submenu: [
        { label: 'Style', submenu: Object.entries(STYLES).map(([k, v]) => radio(v.label, 'style', k)) },
        { label: 'Size', submenu: [radio('Small', 'size', 'S'), radio('Medium', 'size', 'M'), radio('Large', 'size', 'L')] },
        { label: 'Shape', submenu: [radio('Floating pill', 'layout', 'pill'), radio('Full width', 'layout', 'full')] },
        { label: 'Clock', submenu: [check('24-hour', 'clock24'), check('Show seconds', 'clockSeconds')] },
      ],
    },
    {
      label: 'Position', glyph: 'move',
      submenu: [
        radio('Bottom', 'edge', 'bottom'), radio('Top', 'edge', 'top'),
        radio('Left', 'edge', 'left'), radio('Right', 'edge', 'right'),
        ...(displays.length > 1 ? [
          { type: 'separator' },
          ...displays.map((d, i) => ({
            label: `Display ${i + 1}${d.id === primaryId ? ' (main)' : ''} · ${d.size.width}×${d.size.height}`,
            type: 'radio', checked: d.id === targetDisplay().id,
            click: () => setConfig({ displayId: d.id }),
          })),
        ] : []),
        { type: 'separator' },
        { label: cfg.locked ? 'Unlock the dock to drag it' : 'Tip: drag the ⋮⋮ grip to any edge', enabled: false },
      ],
    },
    {
      label: `Battery saver${saverActive ? ' (on now)' : ''}`, glyph: 'leaf',
      submenu: [
        radio('Off', 'batterySaver', 'off'),
        radio('Automatic: when on battery', 'batterySaver', 'auto'),
        radio('Always on', 'batterySaver', 'on'),
        { type: 'separator' },
        { label: 'Updates less often, turns off glass and animations', enabled: false },
      ],
    },
    { type: 'separator' },
    check('Lock the dock', 'locked', { glyph: 'lock' }),
    check('Hide Windows taskbar', 'hideTaskbar', { enabled: IS_WIN, glyph: 'taskbar' }),
    {
      label: 'Launch at startup', glyph: 'power', type: 'checkbox', checked: login.openAtLogin,
      click: () => app.setLoginItemSettings({ openAtLogin: !login.openAtLogin }),
    },
    {
      label: 'AI accounts', glyph: 'spark',
      submenu: Object.entries(web.SERVICES).map(([id, svc]) => (cfg.web[id]
        ? { label: `Disconnect ${svc.host}`, click: () => disconnectWeb(id) }
        : { label: `Connect ${svc.host}…`, click: () => connectWeb(id) })),
    },
    { label: 'Settings…', glyph: 'gear', click: () => openPanel('settings') },
    { type: 'separator' },
    { label: 'Quit GlassDock', glyph: 'quit', danger: true, click: () => app.quit() },
  ];
}

// ---------------------------------------------------------------- show / hide the dock, tray icon
// Hiding the dock also gives back its screen space and brings the Windows taskbar back,
// so you're never left without one.
function applyDockVisibility() {
  if (!dock || dock.isDestroyed()) return;
  if (cfg.dockHidden) {
    hidePopup();
    dock.hide();
    try { win32 && win32.appBarRemove(); } catch {}
    restoreTaskbar();
  } else {
    try { win32 && dockHwnd && win32.appBarRegister(dockHwnd, APPBAR_MSG); } catch (e) { console.error(e); }
    layout();
    dock.showInactive();
    applyTaskbar();
  }
}

function setDockHidden(hidden) {
  if (!!cfg.dockHidden === hidden) return;
  setConfig({ dockHidden: hidden });
}

// ---------------------------------------------------------------- battery saver
let saverActive = false;
const TIMERS = {        //  [work,              normal ms,  battery saver ms]
  stats: () => [sampleStats, 2000, 10000],
  running: () => (running ? [pollRunning, 1500, 5000] : null),
  sound: () => (media ? [pollSound, 1000, 4000] : null),
  network: () => (media ? [pollNet, 2000, 6000] : null),
  ai: () => [refreshAi, 60 * 1000, 5 * 60 * 1000],
  web: () => [() => refreshWeb(true), 5 * 60 * 1000, 15 * 60 * 1000],
  weather: () => [refreshWeather, 15 * 60 * 1000, 30 * 60 * 1000],
  yr: () => [() => refreshYr(), 10 * 60 * 1000, 30 * 60 * 1000], // only downloads after MET's Expires time
  calendars: () => [() => refreshCalendars(), 15 * 60 * 1000, 30 * 60 * 1000],
  alerts: () => [checkEventAlerts, 30 * 1000, 60 * 1000],
};
const timerIds = {};

function scheduleTimers() {
  for (const [name, spec] of Object.entries(TIMERS)) {
    const t = spec();
    clearInterval(timerIds[name]);
    if (t) timerIds[name] = setInterval(t[0], saverActive ? t[2] : t[1]);
  }
}

function onBattery() {
  try { return powerMonitor.isOnBatteryPower(); } catch { return false; }
}

function applySaver(force = false) {
  const want = cfg.batterySaver === 'on' || (cfg.batterySaver === 'auto' && onBattery());
  if (want === saverActive && !force) return;
  saverActive = want;
  scheduleTimers();
  applyStyle();
  broadcast('saver', saverActive);
  if (tray) tray.setToolTip(saverActive ? 'GlassDock (battery saver on)' : 'GlassDock');
}

let tray = null;
function createTray() {
  const file = path.join(__dirname, 'assets', IS_WIN ? 'tray.ico' : 'tray.png');
  let icon = nativeImage.createFromPath(file);
  if (!IS_WIN && !icon.isEmpty()) icon.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(path.join(__dirname, 'assets', 'tray@2x.png')) });
  tray = new Tray(icon);
  tray.setToolTip('GlassDock');
  // Left-click shows or hides the dock; right-click opens the full menu.
  tray.on('click', () => setDockHidden(!cfg.dockHidden));
  const menu = () => Menu.buildFromTemplate([
    { label: cfg.dockHidden ? 'Show dock' : 'Hide dock', click: () => setDockHidden(!cfg.dockHidden) },
    { type: 'separator' },
    ...menuTemplate(),
  ]);
  if (IS_WIN) tray.on('right-click', () => tray.popUpContextMenu(menu()));
  else tray.setContextMenu(menu()); // Linux/macOS show the menu themselves
  return menu;
}
let trayMenu = null;

// ---------------------------------------------------------------- ipc
ipcMain.handle('get-state', () => publicState());
ipcMain.handle('geocode', (_e, q) => geocode(String(q || '').slice(0, 100)));
ipcMain.on('set-config', (_e, patch) => {
  const allowed = ['edge', 'layout', 'style', 'size', 'clock24', 'clockSeconds', 'units', 'location', 'hideTaskbar', 'widgets', 'claudeBudget', 'geminiDailyLimit', 'showStart', 'showOpen', 'locked', 'batterySaver', 'eventAlerts', 'yrContact'];
  setConfig(Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k))));
});
let sizeTimer = null;
ipcMain.on('content-size', (_e, size) => {
  const w = Number(size && size.w), h = Number(size && size.h);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return;
  if (Math.abs(w - contentSize.w) < 1 && Math.abs(h - contentSize.h) < 1) return;
  contentSize = { w, h };
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(() => cfg.layout === 'pill' && layout(), 30);
});
ipcMain.on('open-panel', (_e, name, anchor) => openPanel(name, anchor));
ipcMain.on('apps-pin-paths', (_e, paths) => pinPaths(paths));
ipcMain.on('apps-pin-dialog', (_e, kind) => pinWithDialog(kind));
ipcMain.on('apps-launch', (_e, id, opts) => launchApp(id, { newInstance: !!(opts && opts.newInstance) }));
ipcMain.on('apps-menu', (_e, id) => showAppMenu(id));
ipcMain.on('open-focus', (_e, key, opts) => focusOpen(String(key || ''), { newInstance: !!(opts && opts.newInstance) }));
ipcMain.on('open-menu', (_e, key) => showOpenMenu(String(key || '')));
ipcMain.on('apps-reorder', (_e, ids) => {
  if (!Array.isArray(ids)) return;
  const byId = new Map(cfg.pinnedApps.map((e) => [e.id, e]));
  const list = ids.map((id) => byId.get(id)).filter(Boolean);
  for (const e of cfg.pinnedApps) if (!list.includes(e)) list.push(e);
  setConfig({ pinnedApps: list });
});
ipcMain.handle('apps-catalog', () => appCatalog());
ipcMain.on('apps-toggle', (_e, key) => toggleCatalogApp(String(key || '')));
ipcMain.on('sound-volume', (_e, v) => { const n = Number(v); if (Number.isFinite(n)) soundCommand('volume', Math.max(0, Math.min(1, n))); });
ipcMain.on('sound-step', (_e, d) => {
  const lvl = sound && sound.volume ? sound.volume.level : null;
  if (lvl == null || !Number.isFinite(Number(d))) return;
  soundCommand('volume', Math.max(0, Math.min(1, Math.round((lvl + Number(d)) * 100) / 100)));
});
ipcMain.on('sound-mute', (_e, m) => {
  const muted = typeof m === 'boolean' ? m : !(sound && sound.volume && sound.volume.muted);
  soundCommand('mute', muted);
});
ipcMain.on('media-cmd', (_e, cmd) => { if (['play', 'next', 'prev'].includes(cmd)) soundCommand(cmd); });
ipcMain.on('media-seek', (_e, sec) => { const n = Number(sec); if (Number.isFinite(n) && n >= 0) soundCommand('seek', n); });
ipcMain.on('panel-size', (_e, h) => {
  const spec = PANELS[popupName];
  if (spec && Number.isFinite(h) && popup && popup.isVisible()) placePanel(spec.w, Math.min(Math.max(120, h), 700));
});
ipcMain.handle('cal-add', (_e, url) => addCalendar(url));
ipcMain.on('cal-update', (_e, id, patch) => updateCalendar(String(id || ''), patch || {}));
ipcMain.on('cal-remove', (_e, id) => removeCalendar(String(id || '')));
ipcMain.on('cal-refresh', () => refreshCalendars());
// Only meeting links found in your own calendar events are opened.
ipcMain.on('open-event-link', (_e, key) => {
  const ev = eventsPublic().events.find((x) => x.key === key);
  if (ev && ev.link) shell.openExternal(ev.link);
});
ipcMain.on('yr-refresh', () => refreshYr(true));
// Windows' own network screens only.
const NET_PAGES = { wifi: 'ms-availablenetworks:', settings: 'ms-settings:network-status', location: 'ms-settings:privacy-location', adapters: 'ms-settings:network-advancedsettings' };
ipcMain.on('net-open', (_e, which) => { const url = NET_PAGES[which]; if (url) { hidePopup(); shell.openExternal(url); } });
ipcMain.on('yr-open', () => {
  if (!cfg.location) return;
  hidePopup();
  shell.openExternal(`https://www.yr.no/en/forecast/daily-table/${yr.round4(cfg.location.lat)},${yr.round4(cfg.location.lon)}`);
});
ipcMain.on('start-menu', () => { try { win32 && win32.openStartMenu(); } catch (e) { console.error(e); } });
ipcMain.on('drag-start', dragStart);
ipcMain.on('drag-end', dragEnd);
ipcMain.on('web-connect', (_e, id, mode) => connectWeb(id, mode === 'home' ? `https://${web.SERVICES[id]?.host}/` : undefined));
ipcMain.on('web-disconnect', (_e, id) => disconnectWeb(id));
ipcMain.on('web-refresh', () => refreshWeb(true));
ipcMain.on('close-panel', hidePopup);
ipcMain.on('context-menu', showContextMenu);
ipcMain.on('refresh-weather', refreshWeather);

// ---------------------------------------------------------------- app lifecycle
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (IS_WIN) app.setAppUserModelId('dev.glassdock.app');
  // Starting GlassDock again while it runs brings a hidden dock back.
  app.on('second-instance', () => setDockHidden(false));

  app.whenReady().then(() => {
    loadConfig();
    applyStyle();
    createDock();
    createPopup();
    try { trayMenu = createTray(); } catch (e) { console.error('Tray icon unavailable:', e); }
    sampleStats();
    applySaver(true); // also starts the update timers
    powerMonitor.on('on-battery', () => applySaver());
    powerMonitor.on('on-ac', () => applySaver());
    refreshWeather();
    setTimeout(refreshAi, 1500);
    loadAppIcons();
    loadCalendarCache();
    setTimeout(refreshCalendars, 2500);
    setTimeout(() => refreshYr(), 1500);
    if (IS_WIN) setTimeout(() => apps.getCatalog().catch(() => {}), 8000); // warm up the picker
    setTimeout(() => refreshWeb(true), 4000);
    screen.on('display-metrics-changed', () => setTimeout(layout, 200));
    screen.on('display-added', () => setTimeout(layout, 200));
    screen.on('display-removed', () => setTimeout(layout, 200));
  });

  app.on('before-quit', cleanup);
  app.on('window-all-closed', () => app.quit());
  process.on('exit', cleanup);
  process.on('uncaughtException', (e) => {
    console.error(e);
    cleanup();
    process.exit(1);
  });
}
