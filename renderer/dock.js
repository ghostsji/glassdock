/* global esc, applyTheme, glyph, yrIcon, yrTemp, netIcon, fmtRate, mediaIcon, speakerIcon, mediaPosition, icons, fmtTokens, fmtIn, liveWindow, weatherIcon, ring, fmtUptime, fmtTime, tempStr */
const api = window.dock;
const row = document.getElementById('row');
let state = null;
let battery = null;
const vertical = () => state.config.edge === 'left' || state.config.edge === 'right';
const AI_IDS = ['claude', 'codex', 'gemini', 'claude-web', 'chatgpt-web', 'grok-web'];

// Which panel each widget opens.
const PANEL_FOR = { quick: 'quick', network: 'network', yr: 'yr', events: 'calendar', media: 'sound', volume: 'sound', clock: 'calendar', weather: 'weather', cpu: 'system', ram: 'system', disk: 'system', battery: 'system', uptime: 'system', claude: 'ai', codex: 'ai', gemini: 'ai', 'claude-web': 'ai', 'chatgpt-web': 'ai', 'grok-web': 'ai' };

// ---------------------------------------------------------------- widget renderers
const render = {
  // Quick settings button: network + Bluetooth + volume (+ battery on laptops), like Windows'
  quick() {
    const q = state.quick || {};
    const n = state.network;
    const v = state.sound && state.sound.volume;
    if (!n && !v && !state.quick) return '';
    let h = '<span class="qs-icons">';
    if (n) h += `<span class="${n.online ? '' : 'net-off'}">${netIcon(n, 17)}</span>`;
    if (q.bluetooth && q.bluetooth.on) h += glyph('bluetooth', 16);
    if (v) h += speakerIcon(v.level, v.muted, 17);
    if (hasBattery()) {
      h += `<span class="qs-batt">${Math.round(battery.level * 100)}%</span>`;
    }
    return `${h}</span>`;
  },
  // Network: signal icon, the network's name and live speeds (or why you're offline)
  network() {
    const n = state.network;
    if (!n) return '';
    const name = n.type === 'none' ? 'Offline' : n.nameHidden ? 'Wi-Fi' : n.name;
    const line2 = n.type === 'none' ? 'Not connected' : !n.online ? 'No internet'
      : `↓ ${fmtRate(n.down, true)}  ↑ ${fmtRate(n.up, true)}`;
    return `<span class="${n.online ? '' : 'net-off'}">${netIcon(n, 18)}</span><span class="evtext nettext"><span class="et">${esc(name)}</span><span class="es">${esc(line2)}</span></span>`;
  },
  // Yr: symbol + temperature, plus what's coming ("Rain from 14:00", "Dry next 6 h", or today's high/low)
  yr() {
    const y = state.yr;
    if (!y || y.status === 'no-location') return '<span class="l">Set location</span>';
    if (!y.hours || !y.hours.length) return `<span class="l">${y.status === 'error' ? 'Yr offline' : 'Yr…'}</span>`;
    const now = Date.now();
    const h = y.hours.find((x) => x.t + 3600e3 > now) || y.hours[0];
    const units = state.config.units;
    const deg = (c) => `${Math.round(yrTemp(c, units))}°`;
    const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !state.config.clock24 });
    const next6 = y.hours.filter((x) => x.t + 3600e3 > now && x.t < now + 6 * 3600e3);
    const wet = next6.find((x) => x.precip >= 0.1);
    const kind = (s) => (/snow/.test(s) ? 'Snow' : /sleet/.test(s) ? 'Sleet' : 'Rain');
    let hint;
    if (wet) hint = wet.t <= now ? `${kind(wet.symbol)} now` : `${kind(wet.symbol)} from ${t(wet.t)}`;
    else if (y.days && y.days[0]) hint = `↑${deg(y.days[0].max)} ↓${deg(y.days[0].min)}`;
    return `${yrIcon(h.symbol, 22)}<span class="evtext yrtext"><span class="et">${deg(h.temp)}</span><span class="es">${esc(hint || '')}</span></span>`;
  },
  // Next event: "Standup · in 12m", "Now · Design review · until 10:45", or what's on later today.
  events() {
    const ev = state.events;
    if (!ev || !ev.calendars.some((c) => c.enabled)) return '';
    const now = Date.now();
    const color = Object.fromEntries(ev.calendars.map((c) => [c.id, c.color]));
    const timed = ev.events.filter((e) => !e.allDay && e.end > now);
    const live = timed.filter((e) => e.start <= now).sort((a, b) => a.end - b.end)[0];
    const next = timed.find((e) => e.start > now);
    const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !state.config.clock24 });
    const until = (ms) => {
      const min = Math.round((ms - now) / 60000);
      if (min < 1) return 'now';
      if (min < 60) return `in ${min}m`;
      const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
      if (ms < tomorrow.getTime()) return min < 180 ? `in ${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`.trim() : `at ${t(ms)}`;
      const d = new Date(ms);
      return `${d.toLocaleDateString([], { weekday: 'short' })} ${t(ms)}`;
    };
    const join = (e) => (e && e.link && e.start - now < 10 * 60 * 1000 ? `<span class="join" data-join="${esc(e.key)}">Join</span>` : '');
    const dot = (e) => `<i class="evdot" style="background:${esc(color[e.calId] || 'var(--accent)')}"></i>`;
    if (live) {
      return `${dot(live)}<span class="evtext"><span class="et"><b class="now">Now</b> ${esc(live.title)}</span><span class="es">until ${esc(t(live.end))}${next && next.start - now < 30 * 60 * 1000 ? ` · next ${esc(until(next.start))}` : ''}</span></span>${join(live) || join(next)}`;
    }
    if (next && next.start - now < 7 * 864e5) {
      return `${dot(next)}<span class="evtext"><span class="et">${esc(next.title)}</span><span class="es">${esc(until(next.start))}</span></span>${join(next)}`;
    }
    return `${glyph('check', 16)}<span class="evtext"><span class="et">No events</span><span class="es">this week</span></span>`;
  },
  media() {
    const m = state.sound && state.sound.media;
    if (!m || (!m.title && !m.artist)) return '';
    const playing = m.status === 'Playing';
    const art = m.thumb
      ? `<img class="art" src="${esc(m.thumb)}" alt="">`
      : `<span class="art none">${mediaIcon('music', 14)}</span>`;
    const pct = m.duration > 0 ? (100 * mediaPosition(m)) / m.duration : 0;
    return `${art}
      <span class="mtext"><span class="mt">${esc(m.title || m.appName)}</span><span class="ma">${esc(m.artist || m.appName || '')}</span></span>
      <span class="mbtns">
        ${m.canPrev ? `<span class="mb small" data-media="prev" title="Previous">${mediaIcon('prev', 14)}</span>` : ''}
        <span class="mb" data-media="play" title="${playing ? 'Pause' : 'Play'}">${mediaIcon(playing ? 'pause' : 'play', 16)}</span>
        ${m.canNext ? `<span class="mb small" data-media="next" title="Next">${mediaIcon('next', 14)}</span>` : ''}
      </span>
      ${m.duration > 0 ? `<i class="mprog" style="width:${pct.toFixed(1)}%"></i>` : ''}`;
  },
  volume() {
    const v = state.sound && state.sound.volume;
    if (!v) return '';
    const pct = Math.round(v.level * 100);
    return `${speakerIcon(v.level, v.muted)}<span class="v">${v.muted ? 'Muted' : `${pct}%`}</span>`;
  },
  apps() {
    let h = '';
    if (state.config.showStart && api.platform === 'win32') {
      h += `<span class="app start" title="Start">${icons.start}</span>`;
    }
    for (const a of state.config.pinnedApps || []) {
      const icon = state.appIcons && state.appIcons[a.id];
      const face = icon
        ? `<img src="${esc(icon)}" alt="" draggable="false">`
        : `<span class="letter">${esc((a.name || '?').trim().charAt(0).toUpperCase())}</span>`;
      const run = state.running && state.running.pinned && state.running.pinned[a.id];
      const cls = run ? ` running${run.n > 1 ? ' multi' : ''}${run.active ? ' active' : ''}` : '';
      const tip = run ? `${a.name} · ${run.n} window${run.n > 1 ? 's' : ''} (Shift+click for a new one)` : a.name;
      h += `<span class="app${cls}" data-app="${esc(a.id)}" draggable="${!state.config.locked}" title="${esc(tip)}">${face}${run ? '<i class="run"></i>' : ''}</span>`;
    }
    const open = (state.config.showOpen && state.running && state.running.others) || [];
    if (open.length) {
      h += '<span class="appsep"></span>';
      for (const o of open) {
        const face = o.icon
          ? `<img src="${esc(o.icon)}" alt="" draggable="false">`
          : `<span class="letter">${esc((o.name || '?').charAt(0).toUpperCase())}</span>`;
        const tip = o.n > 1 ? `${o.name} · ${o.n} windows` : `${o.name} · ${o.title}`;
        h += `<span class="app open running${o.n > 1 ? ' multi' : ''}${o.active ? ' active' : ''}" data-open="${esc(o.key)}" title="${esc(tip)}">${face}<i class="run"></i></span>`;
      }
    }
    h += `<span class="app add" title="Pin apps (or drop files here)">${icons.plus}</span>`;
    return h;
  },
  clock() {
    const now = new Date();
    if (vertical()) {
      // narrow dock: time, then AM/PM, then a short date
      const parts = new Intl.DateTimeFormat([], {
        hour: state.config.clock24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !state.config.clock24,
      }).formatToParts(now);
      const time = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
      const period = parts.find((p) => p.type === 'dayPeriod');
      const short = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `<span class="time">${esc(time)}</span>${period ? `<span class="date">${esc(period.value)}</span>` : ''}<span class="date">${esc(short)}</span>`;
    }
    const date = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return `<span class="time">${esc(fmtTime(now, state.config))}</span><span class="date">${esc(date)}</span>`;
  },
  weather() {
    const w = state.weather;
    if (!state.config.location) return '<span class="l">Set location</span>';
    if (!w || !w.data) return `<span class="l">${w && !w.ok ? 'Offline' : '…'}</span>`;
    const c = w.data.current;
    return `${weatherIcon(c.weather_code, c.is_day, 20)}<span class="v">${tempStr(c.temperature_2m)}</span>`;
  },
  cpu() {
    const s = state.stats;
    const p = s ? s.cpu : 0;
    return `${ring(p)}<span class="l">CPU</span><span class="v">${Math.round(p)}%</span>`;
  },
  ram() {
    const s = state.stats;
    const p = s ? (100 * s.memUsed) / s.memTotal : 0;
    return `${ring(p)}<span class="l">RAM</span><span class="v">${Math.round(p)}%</span>`;
  },
  disk() {
    const d = state.stats && state.stats.disk;
    const p = d ? (100 * (d.total - d.free)) / d.total : 0;
    return `${ring(p)}<span class="l">${esc(d ? d.label : 'Disk')}</span><span class="v">${Math.round(p)}%</span>`;
  },
  battery() {
    if (!battery) return '';
    const p = Math.round(battery.level * 100);
    const fillW = Math.max(1, Math.round(13 * battery.level));
    const color = battery.charging ? '#4cd964' : p <= 20 ? 'var(--bad)' : 'currentColor';
    const bolt = battery.charging
      ? '<path d="M11.5 5.5 8.6 10h2.2l-1 3.5 3-4.6h-2.2z" fill="var(--fg)" stroke="var(--bg)" stroke-width=".6"/>'
      : '';
    return `<span class="batt"><svg width="24" height="18" viewBox="0 0 22 18">
        <rect x="1" y="3.5" width="17" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/>
        <rect x="19" y="7" width="1.8" height="4" rx=".9" fill="currentColor" opacity=".55"/>
        <rect x="3" y="5.5" width="${fillW}" height="7" rx="1.6" fill="${color}"/>${bolt}
      </svg></span><span class="v">${p}%</span>${state.saver ? `<span class="leaf" title="Battery saver is on">${glyph('leaf', 13)}</span>` : ''}`;
  },
  claude() {
    const c = state.ai && state.ai.claude;
    if (!c || !c.found) return '';
    if (!c.active || c.resetsAt <= Date.now()) return `${icons.claude}<span class="l">Idle</span>`;
    const budget = state.config.claudeBudget;
    const left = `<span class="l">${fmtIn(c.resetsAt)}</span>`;
    if (budget > 0) {
      const p = (100 * c.window.total) / budget;
      return `${ring(p, 18, '#E8875B')}<span class="v">${Math.round(p)}%</span>${left}`;
    }
    return `${icons.claude}<span class="v">${fmtTokens(c.window.total)}</span>${left}`;
  },
  codex() {
    const c = state.ai && state.ai.codex;
    if (!c || !c.found || c.empty || !c.primary) return '';
    const w = liveWindow(c.primary);
    const p = w.pct;
    const left = w.resetsAt ? `<span class="l">${fmtIn(w.resetsAt)}</span>` : '';
    return `${ring(p, 18, p > 85 ? 'var(--bad)' : '#10A37F')}<span class="l">Codex</span><span class="v">${Math.round(p)}%</span>${left}`;
  },
  gemini() {
    const g = state.ai && state.ai.gemini;
    if (!g || !g.found || g.empty) return '';
    const limit = state.config.geminiDailyLimit;
    const used = g.source === 'chats' ? g.today.requests : g.promptsToday;
    if (g.resetsAt <= Date.now()) return `${icons.gemini}<span class="v">0</span><span class="l">req</span>`;
    const left = used > 0 ? `<span class="l">${fmtIn(g.resetsAt)}</span>` : '';
    if (limit > 0 && g.source === 'chats') {
      const p = (100 * used) / limit;
      return `${ring(p, 18, p > 85 ? 'var(--bad)' : '#5B8DEF')}<span class="l">Gemini</span><span class="v">${Math.round(p)}%</span>${left}`;
    }
    return `${icons.gemini}<span class="v">${used}</span><span class="l">${g.source === 'chats' ? 'req' : 'prompts'}</span>${left}`;
  },
  'claude-web'() { return webWidget('claude', 'Claude', '#E8875B'); },
  'chatgpt-web'() { return webWidget('chatgpt', 'ChatGPT', '#10A37F'); },
  'grok-web'() { return webWidget('grok', 'Grok', '#A8B0BD'); },
  uptime() {
    const s = state.stats;
    return `${icons.clock}<span class="v">${s ? fmtUptime(s.uptime) : '–'}</span>`;
  },
};

function webWidget(id, name, color) {
  const s = state.ai && state.ai.web && state.ai.web[id];
  if (!s || !s.connected) return '';
  const label = `<span class="l">${name}</span>`;
  if (s.status === 'signed_out') return `${ring(0, 18, color)}${label}<span class="v warn">Sign in</span>`;
  if (s.status === 'pending') return `${ring(0, 18, color)}${label}<span class="v">…</span>`;
  const w = liveWindow(s.primary);
  if (!w) return `${ring(0, 18, color)}${label}<span class="v warn">!</span>`;
  const left = w.resetsAt ? `<span class="l">${fmtIn(w.resetsAt)}</span>` : '';
  const stale = s.status !== 'ok' ? ' style="opacity:.55"' : '';
  return `<span class="rw"${stale}>${ring(w.pct, 18, w.pct > 85 ? 'var(--bad)' : color)}</span>${label}<span class="v">${Math.round(w.pct)}%</span>${left}`;
}

const hasBattery = () => !!battery && !(battery.charging && battery.level === 1 && battery.chargingTime === 0);

// ---------------------------------------------------------------- build / update
function visibleWidgets() {
  return state.config.widgets.filter((id) => {
    if (!render[id]) return false;
    if (id === 'battery') return hasBattery();
    if (AI_IDS.includes(id) || ['media', 'volume', 'events', 'network', 'quick'].includes(id)) return render[id]() !== ''; // hide when unavailable
    return true;
  });
}

function build() {
  row.innerHTML = state.config.locked ? '' : '<span class="grip" title="Drag to move the dock to any edge"></span>';
  for (const id of visibleWidgets()) {
    const el = document.createElement(id === 'apps' ? 'div' : 'button');
    el.className = `w ${id}`;
    el.dataset.id = id;
    el.draggable = !state.config.locked;
    el.innerHTML = render[id]();
    if (id === 'apps') { setupApps(el); addDrag(el); row.appendChild(el); continue; }
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-media]');
      if (act) { api.mediaCmd(act.dataset.media); return; }
      const jn = e.target.closest('[data-join]');
      if (jn) { api.openEventLink(jn.dataset.join); return; }
      const r = el.getBoundingClientRect();
      const panel = (id === 'weather' || id === 'yr') && !state.config.location ? 'settings' : PANEL_FOR[id];
      api.openPanel(panel, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    if (id === 'volume' || id === 'media' || id === 'quick') {
      // scroll to change the volume, middle-click to mute
      el.addEventListener('wheel', (e) => { e.preventDefault(); api.volumeStep(e.deltaY < 0 ? 0.02 : -0.02); }, { passive: false });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); api.toggleMute(); } });
    }
    addDrag(el);
    row.appendChild(el);
  }
  if (!row.querySelector('.w')) {
    row.insertAdjacentHTML('beforeend', '<span class="w"><span class="l">Right-click → Widgets</span></span>');
  }
}

function update(ids) {
  for (const id of ids || Object.keys(render)) {
    const el = row.querySelector(`.w[data-id="${id}"]`);
    if (el) {
      const html = render[id]();
      if (el.innerHTML !== html) el.innerHTML = html;
    }
  }
}

// ---------------------------------------------------------------- pinned apps
let appDrag = null;

function setupApps(el) {
  const anchor = (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  el.addEventListener('click', (e) => {
    const a = e.target.closest('.app');
    if (!a) return;
    if (a.classList.contains('start')) api.startMenu();
    else if (a.dataset.open) api.focusOpen(a.dataset.open, { newInstance: e.shiftKey });
    else if (a.classList.contains('add')) api.openPanel('apps', anchor(a));
    else if (a.dataset.app) {
      const fresh = e.shiftKey || !a.classList.contains('running');
      if (fresh) {
        a.classList.add('launching');
        setTimeout(() => a.classList.remove('launching'), 600);
      }
      api.launchApp(a.dataset.app, { newInstance: e.shiftKey });
    }
  });
  // middle-click: always a new window, like the taskbar
  el.addEventListener('auxclick', (e) => {
    const a = e.target.closest('.app[data-app], .app[data-open]');
    if (!a || e.button !== 1) return;
    e.preventDefault();
    a.classList.add('launching');
    setTimeout(() => a.classList.remove('launching'), 600);
    if (a.dataset.open) api.focusOpen(a.dataset.open, { newInstance: true });
    else api.launchApp(a.dataset.app, { newInstance: true });
  });
  el.addEventListener('contextmenu', (e) => {
    const a = e.target.closest('.app[data-app], .app[data-open]');
    if (!a) return; // falls through to the dock menu
    e.preventDefault();
    e.stopPropagation();
    if (a.dataset.open) api.openMenu(a.dataset.open); else api.appMenu(a.dataset.app);
  });
  // drag an icon to reorder it
  el.addEventListener('dragstart', (e) => {
    const a = e.target.closest('.app[data-app]');
    if (!a) return;
    appDrag = a;
    a.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', a.dataset.app);
  });
  el.addEventListener('dragover', (e) => {
    if (!appDrag) return;
    e.preventDefault();
    const t = e.target.closest('.app[data-app]');
    if (!t || t === appDrag) return;
    const r = t.getBoundingClientRect();
    const after = vertical() ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    el.insertBefore(appDrag, after ? t.nextSibling : t);
  });
  el.addEventListener('dragend', () => {
    if (!appDrag) return;
    appDrag.classList.remove('dragging');
    appDrag = null;
    const ids = [...el.querySelectorAll('.app[data-app]')].map((n) => n.dataset.app);
    if (ids.join() !== (state.config.pinnedApps || []).map((a) => a.id).join()) api.reorderApps(ids);
  });
}

// Drop files, shortcuts or folders from Explorer anywhere on the dock to pin them.
function setupFileDrop() {
  const isFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let depth = 0;
  document.addEventListener('dragenter', (e) => { if (isFiles(e)) { depth++; document.body.classList.add('dropping'); } });
  document.addEventListener('dragleave', (e) => {
    if (isFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('dropping'); }
  });
  // Without these, Chromium would navigate the dock to the dropped file.
  document.addEventListener('dragover', (e) => { if (isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; } });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dropping');
    const paths = [...(e.dataTransfer.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length) api.pinPaths(paths);
  });
}

// ---------------------------------------------------------------- drag to reorder
let dragEl = null;
function addDrag(el) {
  el.addEventListener('dragstart', (e) => {
    if (e.target !== el) return; // an app icon inside the apps group is being dragged
    dragEl = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.id);
  });
  el.addEventListener('dragover', (e) => {
    if (!dragEl || dragEl === el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = vertical() ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    row.insertBefore(dragEl, after ? el.nextSibling : el);
  });
  el.addEventListener('drop', (e) => e.preventDefault());
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dragEl = null;
    const order = [...row.querySelectorAll('.w[data-id]')].map((n) => n.dataset.id);
    // keep hidden-but-enabled widgets (e.g. battery on a desktop) in the list
    const rest = state.config.widgets.filter((id) => !order.includes(id));
    const widgets = [...order, ...rest];
    if (widgets.join() !== state.config.widgets.join()) api.setConfig({ widgets });
  });
}

// ---------------------------------------------------------------- drag the whole dock to an edge
// Grab the grip (or any empty part of the bar), drag, and let go near any screen edge.
function setupMoveDrag() {
  const bar = document.getElementById('bar');
  let start = null;
  let moving = false;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || state.config.locked || e.target.closest('.w[data-id]')) return;
    start = { x: e.screenX, y: e.screenY };
    moving = false;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!start || moving) return;
    if (Math.hypot(e.screenX - start.x, e.screenY - start.y) > 5) {
      moving = true;
      document.body.classList.add('moving');
      api.dragStart();
    }
  });
  const stop = () => {
    if (moving) api.dragEnd();
    start = null;
    moving = false;
    document.body.classList.remove('moving');
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);
}

// ---------------------------------------------------------------- init
async function init() {
  state = await api.getState();
  applyTheme(state.config);
  document.body.dataset.saver = state.saver ? '1' : '0';

  if (navigator.getBattery) {
    try {
      battery = await navigator.getBattery();
      const onChange = () => { if (state) build(); };
      ['levelchange', 'chargingchange'].forEach((ev) => battery.addEventListener(ev, onChange));
    } catch { battery = null; }
  }
  build();

  api.onConfig((c) => { state.config = c; applyTheme(c); build(); });
  api.onSaver((v) => { state.saver = v; document.body.dataset.saver = v ? '1' : '0'; build(); });
  api.onYr((y) => { state.yr = y; update(['yr']); });
  api.onQuick((q) => { state.quick = q; update(['quick']); });
  api.onNetwork((n) => {
    const before = visibleWidgets().join();
    state.network = n;
    if (visibleWidgets().join() !== before) build(); else update(['network', 'quick']);
  });
  api.onEvents((ev) => {
    const before = visibleWidgets().join();
    state.events = ev;
    if (visibleWidgets().join() !== before) build(); else update(['events']);
  });
  api.onSound((snd) => {
    const before = visibleWidgets().join();
    state.sound = snd;
    if (visibleWidgets().join() !== before) build(); else update(['media', 'volume', 'quick']);
  });
  api.onAppIcons((m) => { state.appIcons = m; update(['apps']); });
  api.onRunning((r) => { state.running = r; if (!appDrag) update(['apps']); });
  api.onStats((s) => { state.stats = s; update(['cpu', 'ram', 'disk', 'uptime']); });
  api.onWeather((w) => { state.weather = w; update(['weather']); });
  api.onAi((a) => {
    const before = visibleWidgets().join();
    state.ai = a;
    if (visibleWidgets().join() !== before) build(); else update(AI_IDS);
  });

  // Tick the clock exactly on the second.
  const tick = () => { update(['clock']); if (state.sound && state.sound.media && state.sound.media.status === 'Playing') update(['media']); if (new Date().getSeconds() === 0) update([...AI_IDS, 'events', 'yr']); setTimeout(tick, 1000 - (Date.now() % 1000) + 5); };
  tick();

  // Tell the main process how big our content is so the pill can hug it.
  const ro = new ResizeObserver(() => api.contentSize(row.scrollWidth + 14, row.scrollHeight + 14));
  ro.observe(row);

  setupMoveDrag();
  setupFileDrop();

  document.addEventListener('contextmenu', (e) => { e.preventDefault(); api.contextMenu(); });
}

init();
