// Helpers shared by the dock and the popup panels.
/* exported esc, applyTheme, weatherInfo, weatherIcon, icons, fmtBytes, fmtUptime, fmtTime, ring, tempStr, fmtTokens, fmtIn, liveWindow, glyph, mediaIcon, speakerIcon, fmtDuration, mediaPosition, yrIcon, yrText, yrTemp, yrWind, netIcon, fmtRate */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function applyTheme(config) {
  const b = document.body;
  b.dataset.style = config.style;
  b.dataset.size = config.size;
  b.dataset.layout = config.layout;
  b.dataset.edge = config.edge;
  b.dataset.vertical = config.edge === 'left' || config.edge === 'right' ? '1' : '0';
  b.dataset.platform = window.dock.platform;
}

// ---- weather codes (WMO) -> description + icon
function weatherInfo(code) {
  if (code === 0) return { text: 'Clear', icon: 'clear' };
  if (code === 1) return { text: 'Mainly clear', icon: 'clear' };
  if (code === 2) return { text: 'Partly cloudy', icon: 'partly' };
  if (code === 3) return { text: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { text: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: 'rain' };
  if (code >= 61 && code <= 67) return { text: code >= 65 ? 'Heavy rain' : 'Rain', icon: 'rain' };
  if (code >= 71 && code <= 77) return { text: 'Snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { text: 'Showers', icon: 'rain' };
  if (code === 85 || code === 86) return { text: 'Snow showers', icon: 'snow' };
  if (code >= 95) return { text: 'Thunderstorm', icon: 'storm' };
  return { text: 'Unknown', icon: 'cloud' };
}

const CLOUD = '<path d="M7.2 19h9.9a4.1 4.1 0 0 0 .5-8.17A5.6 5.6 0 0 0 6.9 9.9 4.6 4.6 0 0 0 7.2 19z" fill="currentColor" opacity=".92"/>';
const CLOUD_UP = '<path d="M7.2 15.5h9.9a4.1 4.1 0 0 0 .5-8.17A5.6 5.6 0 0 0 6.9 6.4a4.6 4.6 0 0 0 .3 9.1z" fill="currentColor" opacity=".92"/>';
const SUN_RAYS = (cx, cy, r1, r2) => Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"/>`;
}).join('');

const WEATHER_SVG = {
  sun: `<circle cx="12" cy="12" r="4.3" fill="#FFC23D"/><g stroke="#FFC23D" stroke-width="1.8" stroke-linecap="round">${SUN_RAYS(12, 12, 6.8, 9.2)}</g>`,
  moon: '<path d="M19.5 14.6A7.6 7.6 0 1 1 9.4 4.5a6.1 6.1 0 0 0 10.1 10.1z" fill="#CBD5FF"/>',
  partlyDay: `<circle cx="8.5" cy="8.5" r="3.4" fill="#FFC23D"/><g stroke="#FFC23D" stroke-width="1.6" stroke-linecap="round">${SUN_RAYS(8.5, 8.5, 5.3, 7)}</g>${CLOUD}`,
  partlyNight: `<path d="M13.2 8.6A5.2 5.2 0 1 1 6.3 2.8a4.1 4.1 0 0 0 6.9 5.8z" fill="#CBD5FF"/>${CLOUD}`,
  cloud: CLOUD,
  fog: `${CLOUD_UP}<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"><line x1="5" y1="18.5" x2="19" y2="18.5"/><line x1="7" y1="21.5" x2="17" y2="21.5"/></g>`,
  rain: `${CLOUD_UP}<g stroke="#6CB8FF" stroke-width="1.8" stroke-linecap="round"><line x1="8.5" y1="18" x2="7.5" y2="21"/><line x1="12.5" y1="18" x2="11.5" y2="21"/><line x1="16.5" y1="18" x2="15.5" y2="21"/></g>`,
  snow: `${CLOUD_UP}<g fill="#DDEEFF"><circle cx="8" cy="19" r="1.2"/><circle cx="12" cy="21" r="1.2"/><circle cx="16" cy="19" r="1.2"/></g>`,
  storm: `${CLOUD_UP}<path d="M12.8 15.5 10 19.6h2.6L11.4 23l3.6-4.9h-2.6l1.3-2.6z" fill="#FFD23D"/>`,
};

function weatherIcon(code, isDay = 1, size = 20) {
  const kind = weatherInfo(code).icon;
  let key = kind;
  if (kind === 'clear') key = isDay ? 'sun' : 'moon';
  if (kind === 'partly') key = isDay ? 'partlyDay' : 'partlyNight';
  return `<svg class="wx" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${WEATHER_SVG[key]}</svg>`;
}

const icons = {
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  chevL: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  chevR: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  claude: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2.5c.5 4.6 2.3 6.9 7 7.5v.9c-4.7.6-6.5 2.9-7 7.5h-.9c-.5-4.6-2.3-6.9-7-7.5V10c4.7-.6 6.5-2.9 7-7.5z" transform="translate(.45 1.1)" fill="#E8875B"/></svg>',
  codex: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10A37F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7.5 10l2.5 2-2.5 2M12.5 14.5h4"/></svg>',
  gemini: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2c.6 5.3 4.7 9.4 10 10-5.3.6-9.4 4.7-10 10-.6-5.3-4.7-9.4-10-10 5.3-.6 9.4-4.7 10-10z" fill="#5B8DEF"/></svg>',
  start: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="3.5" y="3.5" width="7.6" height="7.6" rx="1.6"/><rect x="12.9" y="3.5" width="7.6" height="7.6" rx="1.6"/><rect x="3.5" y="12.9" width="7.6" height="7.6" rx="1.6"/><rect x="12.9" y="12.9" width="7.6" height="7.6" rx="1.6"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.5h6.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
  grok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M15.5 7.5 8.5 16.5"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
};

// Circular meter used for CPU / RAM / disk.
function ring(pct, size = 18, color) {
  const r = (size - 3.5) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  const col = color || (p > 85 ? 'var(--bad)' : p > 65 ? 'var(--warn)' : 'var(--accent)');
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="3"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"
      stroke-dasharray="${((p / 100) * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(date, config, withSeconds = config.clockSeconds) {
  return date.toLocaleTimeString([], {
    hour: config.clock24 ? '2-digit' : 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: !config.clock24,
  });
}

function fmtTokens(n) {
  if (!Number.isFinite(n)) return '–';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

// "2h 14m" until a future timestamp.
function fmtIn(ts) {
  const ms = Math.max(0, ts - Date.now());
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.ceil((ms % 36e5) / 6e4);
  if (d) return `${d}d ${h}h`;
  if (h) return m === 60 ? `${h + 1}h` : `${h}h ${m}m`;
  return `${m}m`;
}

// A usage window whose reset time has passed is back to 0%, even before the next refresh.
function liveWindow(w) {
  if (!w) return w;
  if (w.resetsAt && w.resetsAt <= Date.now()) return { ...w, pct: 0, resetsAt: null, detail: null };
  return w;
}

function tempStr(t) {
  return Number.isFinite(t) ? `${Math.round(t)}°` : '–';
}

// Line icons for the glass menus (16px, drawn with currentColor).
const GLYPHS = {
  window: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17"/>',
  minimize: '<path d="M6 17h12"/>',
  restore: '<rect x="5" y="8" width="11" height="11" rx="2"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5H17.5A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5H16"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  stop: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 8.5l7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  open: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M17 14v3.5A1.5 1.5 0 0 1 15.5 19h-9A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7H10"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H10l2 2.2h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  up: '<path d="M6 14.5l6-6 6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z"/><path d="M12 13.5V20"/>',
  unpin: '<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z"/><path d="M12 13.5V20"/><path d="M4 4l16 16"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  desktop: '<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
  gear: '<path d="M12.2 2.5h-.4a1.8 1.8 0 0 0-1.8 1.8v.2a1.8 1.8 0 0 1-.9 1.5l-.4.2a1.8 1.8 0 0 1-1.8 0l-.1-.1a1.8 1.8 0 0 0-2.5.7l-.2.3a1.8 1.8 0 0 0 .7 2.5l.1.1a1.8 1.8 0 0 1 .9 1.5v.5a1.8 1.8 0 0 1-.9 1.6l-.1.1a1.8 1.8 0 0 0-.7 2.5l.2.3a1.8 1.8 0 0 0 2.5.7l.1-.1a1.8 1.8 0 0 1 1.8 0l.4.2a1.8 1.8 0 0 1 .9 1.6v.1a1.8 1.8 0 0 0 1.8 1.8h.4a1.8 1.8 0 0 0 1.8-1.8v-.2a1.8 1.8 0 0 1 .9-1.5l.4-.2a1.8 1.8 0 0 1 1.8 0l.1.1a1.8 1.8 0 0 0 2.5-.7l.2-.3a1.8 1.8 0 0 0-.7-2.5l-.1-.1a1.8 1.8 0 0 1-.9-1.6v-.4a1.8 1.8 0 0 1 .9-1.6l.1-.1a1.8 1.8 0 0 0 .7-2.5l-.2-.3a1.8 1.8 0 0 0-2.5-.7l-.1.1a1.8 1.8 0 0 1-1.8 0l-.4-.2a1.8 1.8 0 0 1-.9-1.5v-.2a1.8 1.8 0 0 0-1.8-1.8z"/><circle cx="12" cy="12" r="3"/>',
  apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><circle cx="16.75" cy="16.75" r="3.25"/>',
  start: '<rect x="4" y="4" width="7" height="7" rx="1.4"/><rect x="13" y="4" width="7" height="7" rx="1.4"/><rect x="4" y="13" width="7" height="7" rx="1.4"/><rect x="13" y="13" width="7" height="7" rx="1.4"/>',
  grid: '<path d="M4 9h16M4 15h16M9 4v16M15 4v16"/><rect x="4" y="4" width="16" height="16" rx="2.5"/>',
  brush: '<path d="M14.5 4.5l5 5-7.5 7.5-5-5z"/><path d="M7 12l-2.5 2.5c-1 1-1 4 1 5.5 2-.5 3.5-1 4.5-2L12.5 15.5"/>',
  move: '<path d="M12 3.5v17M3.5 12h17M12 3.5l-2.5 2.5M12 3.5l2.5 2.5M12 20.5l-2.5-2.5M12 20.5l2.5-2.5M3.5 12 6 9.5M3.5 12 6 14.5M20.5 12 18 9.5M20.5 12 18 14.5"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5 19z"/><path d="M5 19l8-8"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  taskbar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 15.5h17"/>',
  power: '<path d="M12 4v7"/><path d="M7.5 6.8a7 7 0 1 0 9 0"/>',
  spark: '<path d="M12 3.5c.6 4.4 3.9 7.7 8.5 8.5-4.6.8-7.9 4.1-8.5 8.5-.6-4.4-3.9-7.7-8.5-8.5 4.6-.8 7.9-4.1 8.5-8.5z"/>',
  quit: '<path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14"/><path d="M10 12h10M17 8.5l3.5 3.5L17 15.5"/>',
  eye: '<path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z"/><path d="M4 4l16 16"/>',
  chevron: '<path d="M9.5 6l6 6-6 6"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
function glyph(name, size = 16) {
  const d = GLYPHS[name];
  return d ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>` : '';
}

// Filled media icons and a speaker that shows the volume level.
const MEDIA_ICONS = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  next: '<path d="M5 6.3v11.4a.9.9 0 0 0 1.4.75l8.4-5.7a.9.9 0 0 0 0-1.5L6.4 5.55A.9.9 0 0 0 5 6.3z"/><rect x="16.5" y="5.5" width="2.6" height="13" rx="1"/>',
  prev: '<path d="M19 6.3v11.4a.9.9 0 0 1-1.4.75l-8.4-5.7a.9.9 0 0 1 0-1.5l8.4-5.7A.9.9 0 0 1 19 6.3z"/><rect x="4.9" y="5.5" width="2.6" height="13" rx="1"/>',
  music: '<path d="M9 17.5V6.2a1 1 0 0 1 .8-1l8.5-1.8a1 1 0 0 1 1.2 1v10.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="6.5" cy="17.5" r="2.7"/><circle cx="17" cy="15" r="2.7"/>',
};
function mediaIcon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor">${MEDIA_ICONS[name] || ''}</svg>`;
}

function speakerIcon(level, muted, size = 18) {
  const waves = muted || level <= 0 ? ''
    : `<path d="M15.5 9a4 4 0 0 1 0 6"/>${level > 0.33 ? '<path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>' : ''}${level > 0.66 ? '<path d="M20.5 4a11 11 0 0 1 0 16" opacity=".55"/>' : ''}`;
  const x = muted ? '<path d="M16 9.5l5 5M21 9.5l-5 5"/>' : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9.5h3l4.5-4v13L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" fill="currentColor"/>${waves}${x}</svg>`;
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// Where playback is now: apps only report the position now and then, so add the time since.
function mediaPosition(m) {
  if (!m) return 0;
  let pos = m.position || 0;
  if (m.status === 'Playing' && m.updated) pos += Math.max(0, (Date.now() - m.updated) / 1000);
  return m.duration > 0 ? Math.min(pos, m.duration) : pos;
}

// ---- Yr (MET Norway) symbol codes, e.g. "lightrainshowersandthunder_day"
WEATHER_SVG.sleet = `${CLOUD_UP}<g stroke="#6CB8FF" stroke-width="1.8" stroke-linecap="round"><line x1="8.5" y1="18" x2="7.5" y2="21"/><line x1="15.5" y1="18" x2="14.5" y2="21"/></g><circle cx="12" cy="20" r="1.2" fill="#DDEEFF"/>`;
WEATHER_SVG.heavyrain = `${CLOUD_UP}<g stroke="#4A9BEF" stroke-width="2" stroke-linecap="round"><line x1="7" y1="18" x2="5.8" y2="22"/><line x1="10.5" y1="18" x2="9.3" y2="22"/><line x1="14" y1="18" x2="12.8" y2="22"/><line x1="17.5" y1="18" x2="16.3" y2="22"/></g>`;
WEATHER_SVG.fairDay = `<circle cx="9" cy="9" r="3.8" fill="#FFC23D"/><g stroke="#FFC23D" stroke-width="1.6" stroke-linecap="round">${SUN_RAYS(9, 9, 5.8, 7.6)}</g><path d="M11 20h7.2a3.2 3.2 0 0 0 .3-6.38A4.4 4.4 0 0 0 10.2 13a3.5 3.5 0 0 0 .8 7z" fill="currentColor" opacity=".92"/>`;
WEATHER_SVG.fairNight = `<path d="M14 9.8A5.6 5.6 0 1 1 6.6 3.4a4.4 4.4 0 0 0 7.4 6.4z" fill="#CBD5FF"/><path d="M11 20h7.2a3.2 3.2 0 0 0 .3-6.38A4.4 4.4 0 0 0 10.2 13a3.5 3.5 0 0 0 .8 7z" fill="currentColor" opacity=".92"/>`;

function yrParts(symbol) {
  const [base = '', variant = 'day'] = String(symbol || '').split('_');
  let s = base;
  const thunder = s.endsWith('andthunder'); if (thunder) s = s.slice(0, -'andthunder'.length);
  const showers = s.endsWith('showers'); if (showers) s = s.slice(0, -'showers'.length);
  const intensity = s.startsWith('light') ? 'light' : s.startsWith('heavy') ? 'heavy' : '';
  if (intensity) s = s.slice(intensity.length);
  return { kind: s, thunder, showers, intensity, night: variant !== 'day' };
}

function yrText(symbol) {
  const p = yrParts(symbol);
  const names = { clearsky: 'Clear sky', fair: 'Fair', partlycloudy: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', rain: 'rain', sleet: 'sleet', snow: 'snow' };
  let t = names[p.kind] || 'Unknown';
  if (['rain', 'sleet', 'snow'].includes(p.kind)) {
    t = `${p.intensity ? `${p.intensity} ` : ''}${t}${p.showers ? ' showers' : ''}`;
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  return p.thunder ? `${t} and thunder` : t;
}

function yrIcon(symbol, size = 20) {
  const p = yrParts(symbol);
  let key = 'cloud';
  if (p.thunder) key = 'storm';
  else if (p.kind === 'clearsky') key = p.night ? 'moon' : 'sun';
  else if (p.kind === 'fair') key = p.night ? 'fairNight' : 'fairDay';
  else if (p.kind === 'partlycloudy') key = p.night ? 'partlyNight' : 'partlyDay';
  else if (p.kind === 'fog') key = 'fog';
  else if (p.kind === 'rain') key = p.intensity === 'heavy' ? 'heavyrain' : 'rain';
  else if (p.kind === 'sleet') key = 'sleet';
  else if (p.kind === 'snow') key = 'snow';
  return `<svg class="wx" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${WEATHER_SVG[key]}</svg>`;
}

// Units: MET always sends °C, m/s and mm.
function yrTemp(c, units) { return units === 'fahrenheit' ? (c * 9) / 5 + 32 : c; }
function yrWind(ms, units) { return units === 'fahrenheit' ? `${Math.round(ms * 2.237)} mph` : `${Math.round(ms)} m/s`; }

// ---- network
// Wi-Fi fan with 0-4 lit bars, an Ethernet plug, or a crossed-out globe when offline.
function netIcon(n, size = 18) {
  const svg = (inner) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  if (!n || n.type === 'none') {
    return svg('<path d="M3.5 9a12 12 0 0 1 17 0" opacity=".35"/><path d="M6.5 12.5a7.5 7.5 0 0 1 11 0" opacity=".35"/><path d="M4 4l16 16"/>');
  }
  if (n.type === 'ethernet' || n.type === 'other') {
    return svg(`<rect x="4" y="9" width="16" height="10" rx="2"/><path d="M8 9V6h8v3M8 13v2M12 13v2M16 13v2"/>${n.online ? '' : '<circle cx="19" cy="6" r="3" fill="var(--warn)" stroke="none"/>'}`);
  }
  const bars = n.signal == null ? 4 : n.signal >= 75 ? 4 : n.signal >= 50 ? 3 : n.signal >= 25 ? 2 : 1;
  const arc = (k, d) => `<path d="${d}" opacity="${k <= bars ? 1 : 0.28}"/>`;
  return svg(`${arc(4, 'M2.5 8.5a13.5 13.5 0 0 1 19 0')}${arc(3, 'M5.5 11.8a9 9 0 0 1 13 0')}${arc(2, 'M8.5 15a4.8 4.8 0 0 1 7 0')}<circle cx="12" cy="18.6" r="1.4" fill="currentColor" stroke="none" opacity="${bars >= 1 ? 1 : 0.28}"/>${n.online ? '' : '<circle cx="19.5" cy="18.5" r="3" fill="var(--warn)" stroke="none"/>'}`);
}

function fmtRate(bps, short = false) {
  if (!Number.isFinite(bps) || bps < 1) return short ? '0' : '0 KB/s';
  const u = short ? ['B', 'K', 'M', 'G'] : ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let i = 0;
  while (bps >= 1000 && i < u.length - 1) { bps /= 1024; i++; }
  if (i === 0 && !short) { return `${(bps / 1024).toFixed(1)} KB/s`; }
  const v = bps >= 100 ? Math.round(bps) : bps.toFixed(1);
  return short ? `${v}${u[i]}` : `${v} ${u[i]}`;
}

// ---- quick settings icons
Object.assign(GLYPHS, {
  wifi: '<path d="M2.5 8.5a13.5 13.5 0 0 1 19 0"/><path d="M5.5 11.8a9 9 0 0 1 13 0"/><path d="M8.5 15a4.8 4.8 0 0 1 7 0"/><circle cx="12" cy="18.6" r="1.3" fill="currentColor" stroke="none"/>',
  wifiOff: '<path d="M2.5 8.5a13.5 13.5 0 0 1 19 0" opacity=".35"/><path d="M5.5 11.8a9 9 0 0 1 13 0" opacity=".35"/><path d="M8.5 15a4.8 4.8 0 0 1 7 0" opacity=".35"/><path d="M4 4l16 16"/>',
  bluetooth: '<path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9"/>',
  bluetoothOff: '<path d="M12 12V3l5 4.5-2.5 2.2M12 12v9l5-4.5-2.5-2.2M7 7.5l5 4.5M7 16.5l5-4.5"/><path d="M4 4l16 16"/>',
  airplane: '<path d="M21 15.5v-2l-8-5V4a1.5 1.5 0 0 0-3 0v4.5l-8 5v2l8-2.5V18l-2.5 1.8V21l4-1 4 1v-1.2L13 18v-5z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  bellOff: '<path d="M8.5 4.8A6 6 0 0 1 18 10v3.5l1.5 3H8"/><path d="M6 10v3.5L4.5 16.5H15"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/>',
  hotspot: '<circle cx="12" cy="12" r="1.8"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  cast: '<path d="M3 16a5 5 0 0 1 5 5M3 12a9 9 0 0 1 9 9M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/><circle cx="3.5" cy="20.5" r=".6" fill="currentColor"/>',
  project: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  access: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5l-3 6M12 14.5l3 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  sleep: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M15 4h3l-3 3.5h3" stroke-width="1.6"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>',
  shutdown: '<path d="M12 3.5v8"/><path d="M7 6.5a7.5 7.5 0 1 0 10 0"/>',
  leafCircle: '<path d="M6 18c0-7 4.5-11.5 13-12.5-.5 8.5-5 13-12 13z"/><path d="M6 18l6-6"/>',
});
