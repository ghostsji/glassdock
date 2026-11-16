/* global esc, applyTheme, weatherInfo, weatherIcon, icons, fmtBytes, fmtUptime, fmtTime, tempStr, fmtTokens, fmtIn, liveWindow, glyph, mediaIcon, speakerIcon, fmtDuration, mediaPosition, yrIcon, yrText, yrTemp, yrWind */
const api = window.dock;
const panel = document.getElementById('panel');
let state = null;
let current = null;
let calMonth = null; // Date set to the 1st of the shown month
let clockTimer = null;
let calSelected = null; // day shown in the agenda
let calView = 'month'; // 'month' | 'manage'

// ---------------------------------------------------------------- calendar
function renderCalendar() {
  if (calView === 'manage') { renderCalendars(); return; }
  const now = new Date();
  if (!calMonth) calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!calSelected) calSelected = startOfDay(now);
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  // Monday-first unless the locale is US-style
  const sundayFirst = /^en-(US|CA)|^ja|^ko|^zh-TW/.test(navigator.language);
  const offset = (calMonth.getDay() - (sundayFirst ? 0 : 1) + 7) % 7;
  const start = new Date(y, m, 1 - offset);
  const dows = [...Array(7)].map((_, i) =>
    new Date(2024, 0, (sundayFirst ? 7 : 1) + i).toLocaleDateString([], { weekday: 'narrow' }));
  const ev = state.events || { calendars: [], events: [] };
  const colorOf = calColors();

  let cells = dows.map((d) => `<div class="dow">${esc(d)}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const cls = ['d'];
    if (d.getMonth() !== m) cls.push('out');
    if (sameDay(d, now)) cls.push('today');
    if (sameDay(d, calSelected)) cls.push('sel');
    const dots = [...new Set(eventsOn(ev.events, d).map((e) => colorOf[e.calId]))].slice(0, 3)
      .map((c) => `<i style="background:${esc(c)}"></i>`).join('');
    cells += `<div class="${cls.join(' ')}" data-day="${d.getTime()}"><span>${d.getDate()}</span><span class="dots">${dots}</span></div>`;
  }

  panel.innerHTML = `
    <div>
      <div class="big" id="bigclock">${esc(fmtTime(now, state.config, true))}</div>
      <div class="muted">${esc(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
    </div>
    <div class="row between">
      <div class="title">${esc(calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</div>
      <div class="row" style="gap:2px">
        <button class="iconbtn" id="prev" title="Previous month">${icons.chevL}</button>
        <button class="iconbtn" id="today" title="Today" style="width:auto;padding:0 8px" >Today</button>
        <button class="iconbtn" id="next" title="Next month">${icons.chevR}</button>
      </div>
    </div>
    <div class="cal">${cells}</div>
    <div class="agenda" id="agenda">${agendaHtml(ev, colorOf)}</div>`;

  panel.querySelector('#prev').onclick = () => { calMonth = new Date(y, m - 1, 1); renderCalendar(); };
  panel.querySelector('#next').onclick = () => { calMonth = new Date(y, m + 1, 1); renderCalendar(); };
  panel.querySelector('#today').onclick = () => { calMonth = null; calSelected = null; renderCalendar(); };
  panel.querySelectorAll('.cal .d').forEach((el) => {
    el.onclick = () => {
      const d = new Date(Number(el.dataset.day));
      calSelected = d;
      if (d.getMonth() !== m) calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
    };
  });
  wireAgenda();

  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const el = document.getElementById('bigclock');
    if (el) el.textContent = fmtTime(new Date(), state.config, true);
  }, 1000);
  requestAnimationFrame(() => api.panelSize(Math.min(panel.scrollHeight + 2, 640)));
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function eventsOn(events, day) {
  const s = startOfDay(day).getTime();
  const e = s + 864e5;
  // all-day events end at midnight of the day after; timed events count if they touch the day
  return events.filter((x) => x.start < e && (x.end > s || (x.end === x.start && x.start >= s)));
}
function calColors() {
  return Object.fromEntries(((state.events && state.events.calendars) || []).map((c) => [c.id, c.color]));
}

function eventTime(e, day) {
  if (e.allDay) return 'All day';
  const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !state.config.clock24 });
  const s = startOfDay(day).getTime();
  const startsBefore = e.start < s;
  const endsAfter = e.end > s + 864e5;
  if (startsBefore && endsAfter) return 'All day';
  if (startsBefore) return `until ${t(e.end)}`;
  return e.end > e.start ? `${t(e.start)} – ${t(e.end)}` : t(e.start);
}

function agendaHtml(ev, colorOf) {
  if (!ev.calendars.length) {
    return `<div class="cal-empty">
      <div class="small muted">See your Google, Outlook or iCloud events here and on the dock.</div>
      <button class="btn small" data-cal="manage">${glyph('plus', 14)}&nbsp;Add a calendar</button>
    </div>`;
  }
  const now = Date.now();
  const day = calSelected;
  const isToday = sameDay(day, new Date());
  const list = eventsOn(ev.events, day);
  const label = isToday ? 'Today' : sameDay(day, new Date(Date.now() + 864e5)) ? 'Tomorrow'
    : day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const rows = list.map((e) => {
    const past = !e.allDay && e.end <= now;
    const live = !e.allDay && e.start <= now && e.end > now;
    const soon = e.link && !past && e.start - now < 15 * 60 * 1000;
    return `<div class="ev${past ? ' past' : ''}${live ? ' live' : ''}">
      <i class="bar" style="background:${esc(colorOf[e.calId] || 'var(--accent)')}"></i>
      <div class="grow">
        <div class="ev-title">${esc(e.title)}</div>
        <div class="small muted ev-meta">${esc(eventTime(e, day))}${e.location && !/^https?:/.test(e.location) ? ` · ${esc(e.location)}` : ''}</div>
      </div>
      ${e.link && !past ? `<button class="btn small${soon ? '' : ' ghost'}" data-join="${esc(e.key)}">Join</button>` : ''}
    </div>`;
  }).join('');
  const errors = ev.calendars.filter((c) => c.enabled && c.status === 'error');
  return `
    <div class="row between agenda-head"><span class="title" style="font-size:13px">${esc(label)}</span>
      <button class="iconbtn" data-cal="manage" title="Manage calendars" style="width:auto;padding:0 6px;gap:4px">${glyph('gear', 14)}</button></div>
    ${rows || `<div class="small muted" style="padding:4px 0">${isToday ? 'Nothing else today.' : 'No events.'}</div>`}
    ${errors.length ? `<div class="small" style="color:var(--warn)">${errors.length === 1 ? `${esc(errors[0].name)} couldn't be updated` : `${errors.length} calendars couldn't be updated`}. Showing the last copy.</div>` : ''}`;
}

function wireAgenda() {
  panel.querySelectorAll('[data-cal="manage"]').forEach((b) => { b.onclick = () => { calView = 'manage'; renderCalendar(); }; });
  panel.querySelectorAll('[data-join]').forEach((b) => { b.onclick = () => { api.openEventLink(b.dataset.join); api.closePanel(); }; });
}

// Manage calendars: add iCal links, rename by feed, switch on/off, remove, alerts.
function renderCalendars() {
  clearInterval(clockTimer);
  const ev = state.events || { calendars: [] };
  const ago = (t) => { if (!t) return 'not loaded yet'; const mins = Math.round((Date.now() - t) / 60000); return mins < 1 ? 'updated just now' : mins < 60 ? `updated ${mins} min ago` : `updated ${Math.round(mins / 60)} h ago`; };
  panel.innerHTML = `
    <div class="row" style="gap:6px">
      <button class="iconbtn" id="calBack" title="Back">${glyph('back')}</button>
      <span class="title grow">Calendars</span>
      ${ev.calendars.length ? `<button class="iconbtn" id="calRefresh" title="Refresh now">${icons.refresh}</button>` : ''}
    </div>
    <div class="callist">${ev.calendars.map((c) => `
      <div class="calrow" data-id="${esc(c.id)}">
        <i class="dot" style="background:${esc(c.color)}"></i>
        <div class="grow" style="min-width:0">
          <div class="ellipsis">${esc(c.name)}</div>
          <div class="small ${c.status === 'error' ? '' : 'muted'} ellipsis" style="${c.status === 'error' ? 'color:var(--warn)' : ''}" title="${esc(c.error || '')}">${c.status === 'error' ? esc(c.error) : c.status === 'loading' ? 'loading…' : `${c.count} events · ${ago(c.fetchedAt)}`}</div>
        </div>
        <span class="switch${c.enabled ? ' on' : ''}" data-toggle="${esc(c.id)}" title="${c.enabled ? 'Hide' : 'Show'} this calendar"><i></i></span>
        <button class="iconbtn" data-remove="${esc(c.id)}" title="Remove">${glyph('close', 14)}</button>
      </div>`).join('') || '<div class="small muted">No calendars yet.</div>'}
    </div>
    <div>
      <div class="row" style="gap:6px">
        <input type="text" id="calUrl" placeholder="Paste an iCal link (https:// or webcal://)" autocomplete="off" spellcheck="false">
        <button class="btn" id="calAdd">Add</button>
      </div>
      <div class="small" id="calMsg" style="margin-top:6px;min-height:15px"></div>
    </div>
    <details class="calhelp">
      <summary class="small">Where do I find my calendar's link?</summary>
      <div class="small muted">
        <b>Google Calendar</b> (on the web): Settings → your calendar → <i>Integrate calendar</i> → copy <i>Secret address in iCal format</i>.<br>
        <b>Outlook / Microsoft 365</b>: Settings → Calendar → <i>Shared calendars</i> → <i>Publish a calendar</i> → choose "Can view all details" → copy the <i>ICS</i> link.<br>
        <b>iCloud</b>: Calendar app → share icon next to a calendar → tick <i>Public Calendar</i> → copy the link.<br>
        Keep these links private: anyone with one can read that calendar.
      </div>
    </details>
    <div class="row between">
      <span class="row" style="gap:6px">${glyph('spark', 15)}Alert me 5 minutes before events</span>
      <span class="switch big${state.config.eventAlerts ? ' on' : ''}" id="calAlerts"><i></i></span>
    </div>`;

  panel.querySelector('#calBack').onclick = () => { calView = 'month'; renderCalendar(); };
  const r = panel.querySelector('#calRefresh');
  if (r) r.onclick = () => { r.disabled = true; api.calRefresh(); };
  panel.querySelectorAll('[data-toggle]').forEach((t) => {
    t.onclick = () => { const on = !t.classList.contains('on'); t.classList.toggle('on', on); api.calUpdate(t.dataset.toggle, { enabled: on }); };
  });
  panel.querySelectorAll('[data-remove]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.confirm) { api.calRemove(b.dataset.remove); return; }
      b.dataset.confirm = '1';
      b.classList.add('confirm');
      b.innerHTML = 'Remove?';
      setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.classList.remove('confirm'); b.innerHTML = glyph('close', 14); } }, 3000);
    };
  });
  panel.querySelector('#calAlerts').onclick = () => api.setConfig({ eventAlerts: !state.config.eventAlerts });
  const input = panel.querySelector('#calUrl');
  const msg = panel.querySelector('#calMsg');
  const add = async () => {
    const url = input.value.trim();
    if (!url) return;
    const btn = panel.querySelector('#calAdd');
    btn.disabled = true; input.disabled = true;
    msg.style.color = ''; msg.className = 'small muted'; msg.textContent = 'Checking the link…';
    const res = await api.calAdd(url).catch((e) => ({ ok: false, error: e.message }));
    if (!panel.querySelector('#calUrl')) return; // panel changed meanwhile
    btn.disabled = false; input.disabled = false;
    if (res.ok) { input.value = ''; msg.className = 'small'; msg.style.color = '#34C778'; msg.textContent = 'Added.'; }
    else { msg.className = 'small'; msg.style.color = 'var(--warn)'; msg.textContent = res.error || "Couldn't add that calendar."; input.focus(); }
  };
  panel.querySelector('#calAdd').onclick = add;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  panel.querySelector('.calhelp').addEventListener('toggle', () => requestAnimationFrame(() => api.panelSize(panel.scrollHeight + 2)));
  requestAnimationFrame(() => api.panelSize(panel.scrollHeight + 2));
}

// ---------------------------------------------------------------- Yr forecast
let yrRange = 24; // hours shown in the meteogram

function renderYr() {
  const y = state.yr || {};
  const units = state.config.units;
  const deg = (c) => `${Math.round(yrTemp(c, units))}°`;
  const loc = state.config.location;
  if (!loc) { renderSettings(); return; }
  panel.classList.add('scroll', 'yr-mode');
  const credit = `<div class="yr-credit small muted">Weather forecast from <b>Yr</b>, delivered by the Norwegian Meteorological Institute and NRK</div>`;
  if (!y.hours || !y.hours.length) {
    panel.innerHTML = `<div class="title">${esc(loc.name)}</div>
      <div class="muted">${y.status === 'error' || y.status === 'stale' ? esc(y.error || "Couldn't load the forecast.") : 'Loading the forecast from Yr…'}</div>
      ${y.error ? '<div><button class="btn small" id="yrRetry">Try again</button></div>' : ''}${credit}`;
    const r = panel.querySelector('#yrRetry'); if (r) r.onclick = () => api.yrRefresh();
    requestAnimationFrame(() => api.panelSize(panel.scrollHeight + 2));
    return;
  }
  const now = Date.now();
  const cur = y.hours.find((x) => x.t + 3600e3 > now) || y.hours[0];
  const tz = loc.timezone || undefined;
  const hourLabel = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', hour12: !state.config.clock24, timeZone: tz });
  const precipNow = y.hours.filter((x) => x.t + 3600e3 > now).slice(0, 1).reduce((a, b) => a + b.precip, 0);

  const days = (y.days || []).slice(0, 9).map((d, i) => {
    const date = new Date(`${d.date}T12:00:00`);
    const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'long' });
    const per = ['night', 'morning', 'afternoon', 'evening']
      .map((k) => `<span class="yr-per" title="${k}">${d.periods[k] ? yrIcon(d.periods[k], 24) : ''}</span>`).join('');
    return `<div class="yr-day">
      <span class="yr-dname">${esc(name)}<span class="small muted">${esc(date.toLocaleDateString([], { day: 'numeric', month: 'short' }))}</span></span>
      <span class="yr-pers">${per}</span>
      <span class="yr-temps"><span class="${d.max >= 0 ? 'warm' : 'cold'}">${deg(d.max)}</span><span class="sl">/</span><span class="${d.min >= 0 ? 'warm' : 'cold'}">${deg(d.min)}</span></span>
      <span class="yr-mm">${d.precip > 0 ? `${d.precip.toFixed(1)}<small> mm</small>` : ''}</span>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="row between">
      <div class="row muted small grow" style="gap:4px">${icons.pin}<span class="ellipsis">${esc([loc.name, loc.admin || loc.country].filter(Boolean).join(', '))}</span></div>
      <button class="iconbtn" id="yrRefresh" title="Refresh">${icons.refresh}</button>
    </div>
    <div class="row" style="gap:14px">
      ${yrIcon(cur.symbol, 56)}
      <div class="grow">
        <div class="big ${cur.temp >= 0 ? 'warm' : 'cold'}">${deg(cur.temp)}</div>
        <div class="muted">${esc(yrText(cur.symbol))}</div>
      </div>
      <div class="small muted yr-now">
        <span class="row" style="gap:5px;justify-content:flex-end">${windArrow(cur.windDir)} ${esc(yrWind(cur.wind, units))}${cur.gust ? ` (${esc(yrWind(cur.gust, units))})` : ''}</span>
        <span>${precipNow > 0 ? `${precipNow.toFixed(1)} mm next hour` : 'No rain next hour'}</span>
        ${Number.isFinite(cur.humidity) ? `<span>Humidity ${Math.round(cur.humidity)}%</span>` : ''}
      </div>
    </div>
    <div class="card yr-graph">
      <div class="row between small muted" style="margin-bottom:4px">
        <span>Next ${yrRange} hours</span>
        <div class="seg yr-seg">${[24, 48].map((n) => `<button data-r="${n}" class="${yrRange === n ? 'on' : ''}">${n} h</button>`).join('')}</div>
      </div>
      ${meteogram(y.hours.filter((x) => x.t + 3600e3 > now).slice(0, yrRange), units, hourLabel)}
    </div>
    <div class="yr-days">${days}</div>
    ${y.status === 'stale' ? `<div class="small" style="color:var(--warn)">${esc(y.error)} Showing the last forecast.</div>` : ''}
    <div class="row between small muted"><span>${y.updatedAt ? `Updated ${esc(new Date(y.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !state.config.clock24 }))}` : ''}</span><a class="yr-link" id="yrSite">Open on yr.no</a></div>
    ${credit}`;

  panel.querySelector('#yrRefresh').onclick = () => api.yrRefresh();
  panel.querySelectorAll('.yr-seg button').forEach((b) => { b.onclick = () => { yrRange = Number(b.dataset.r); renderYr(); }; });
  panel.querySelector('#yrSite').onclick = () => api.openYr();
  requestAnimationFrame(() => api.panelSize(Math.min(panel.scrollHeight + 2, 720)));
}

function windArrow(from) {
  if (!Number.isFinite(from)) return '';
  // MET gives where the wind comes FROM; the arrow points where it blows TO
  return `<svg width="13" height="13" viewBox="0 0 24 24" style="transform:rotate(${(from + 180) % 360}deg)"><path d="M12 3l6 15-6-3.5L6 18z" fill="currentColor"/></svg>`;
}

// Yr-style meteogram: temperature curve (red above 0°, blue below), rain bars, symbols on top.
function meteogram(hours, units, hourLabel) {
  if (hours.length < 2) return '';
  const W = 352, H = 150, top = 30, bottom = 20, left = 4, right = 4;
  const n = hours.length;
  const xs = (i) => left + (i + 0.5) * ((W - left - right) / n);
  const temps = hours.map((h) => yrTemp(h.temp, units));
  let lo = Math.min(...temps), hi = Math.max(...temps);
  if (hi - lo < 6) { const mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }
  const plotH = H - top - bottom;
  const ty = (v) => top + (1 - (v - lo) / (hi - lo)) * plotH * 0.8 + plotH * 0.04;
  const zero = yrTemp(0, units);
  const zeroY = Math.max(0, Math.min(H, ty(zero)));
  const pts = temps.map((v, i) => [xs(i), ty(v)]);
  // smooth curve (Catmull-Rom -> cubic Bézier)
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const maxP = Math.max(2, ...hours.map((h) => h.precip));
  const barW = Math.max(2, (W - left - right) / n - 2);
  const bars = hours.map((h, i) => {
    if (!(h.precip > 0)) return '';
    const bh = Math.max(2, (h.precip / maxP) * plotH * 0.45);
    return `<rect x="${(xs(i) - barW / 2).toFixed(1)}" y="${(H - bottom - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="#4AA3EF" opacity=".85"><title>${h.precip.toFixed(1)} mm</title></rect>`;
  }).join('');
  const every = n > 30 ? 6 : 3;
  const labels = hours.map((h, i) => (i % every === 0 ? `<text x="${xs(i).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(hourLabel(h.t))}</text>` : '')).join('');
  const tLabels = hours.map((h, i) => (i % every === 0 ? `<text x="${xs(i).toFixed(1)}" y="${(pts[i][1] - 7).toFixed(1)}" text-anchor="middle" class="tl">${Math.round(temps[i])}°</text>` : '')).join('');
  const syms = hours.map((h, i) => (i % every === 0 ? yrIcon(h.symbol, 20).replace('<svg ', `<svg x="${(xs(i) - 10).toFixed(1)}" y="2" `) : '')).join('');
  const wet = hours.reduce((a, h) => a + h.precip, 0);
  return `<svg class="meteo" viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="${(zeroY / H).toFixed(3)}" stop-color="#FF5B5B"/><stop offset="${(zeroY / H).toFixed(3)}" stop-color="#4AA3EF"/></linearGradient></defs>
    ${zeroY > top && zeroY < H - bottom ? `<line x1="${left}" x2="${W - right}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" class="zero"/>` : ''}
    ${bars}
    <path d="${d}" fill="none" stroke="url(#tg)" stroke-width="2.6" stroke-linecap="round"/>
    ${tLabels}${syms}${labels}
  </svg>
  <div class="small muted" style="text-align:right">${wet > 0 ? `${wet.toFixed(1)} mm total` : 'No rain expected'}</div>`;
}

// ---------------------------------------------------------------- weather
function renderWeather() {
  const w = state.weather;
  const loc = state.config.location;
  if (!loc) { renderSettings(); return; }
  if (!w || !w.data) {
    panel.innerHTML = `<div class="title">${esc(loc.name)}</div>
      <div class="muted">${w && !w.ok ? `Couldn't load weather (${esc(w.error)}).` : 'Loading…'}</div>
      <div><button class="btn" id="retry">Retry</button></div>`;
    panel.querySelector('#retry').onclick = () => api.refreshWeather();
    return;
  }
  const d = w.data;
  const c = d.current;
  const info = weatherInfo(c.weather_code);
  const windUnit = w.units === 'fahrenheit' ? 'mph' : 'km/h';

  // next 8 hours, starting at the current hour
  const nowIdx = Math.max(0, d.hourly.time.findIndex((t) => new Date(t) > new Date()) - 1);
  const hours = d.hourly.time.slice(nowIdx, nowIdx + 8).map((t, i) => {
    const k = nowIdx + i;
    const label = i === 0 ? 'Now' : new Date(t).toLocaleTimeString([], { hour: 'numeric', hour12: !state.config.clock24 });
    return `<div class="hour"><span class="muted">${esc(label)}</span>
      ${weatherIcon(d.hourly.weather_code[k], d.hourly.is_day[k], 22)}
      <span>${tempStr(d.hourly.temperature_2m[k])}</span></div>`;
  }).join('');

  const lo = Math.min(...d.daily.temperature_2m_min);
  const hi = Math.max(...d.daily.temperature_2m_max);
  const span = Math.max(1, hi - lo);
  const days = d.daily.time.slice(0, 7).map((t, i) => {
    const name = i === 0 ? 'Today' : new Date(`${t}T12:00`).toLocaleDateString([], { weekday: 'short' });
    const min = d.daily.temperature_2m_min[i];
    const max = d.daily.temperature_2m_max[i];
    return `<div class="day">
      <span>${esc(name)}</span>
      ${weatherIcon(d.daily.weather_code[i], 1, 20)}
      <span class="muted" style="text-align:right">${tempStr(min)}</span>
      <div class="range"><i style="left:${((min - lo) / span) * 100}%;right:${100 - ((max - lo) / span) * 100}%"></i></div>
      <span style="text-align:right">${tempStr(max)}</span>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="row between">
      <div class="row muted small grow" style="gap:4px">${icons.pin}<span class="ellipsis">${esc([loc.name, loc.admin || loc.country].filter(Boolean).join(', '))}</span></div>
      <button class="iconbtn" id="refresh" title="Refresh">${icons.refresh}</button>
      <button class="iconbtn" id="change" title="Change location" style="width:auto;padding:0 8px">Change</button>
    </div>
    <div class="row" style="gap:12px">
      ${weatherIcon(c.weather_code, c.is_day, 48)}
      <div class="grow">
        <div class="big">${tempStr(c.temperature_2m)}</div>
        <div class="muted">${esc(info.text)} · Feels ${tempStr(c.apparent_temperature)}</div>
      </div>
      <div class="small muted" style="text-align:right">
        H ${tempStr(d.daily.temperature_2m_max[0])} · L ${tempStr(d.daily.temperature_2m_min[0])}<br>
        Humidity ${Math.round(c.relative_humidity_2m)}%<br>
        Wind ${Math.round(c.wind_speed_10m)} ${windUnit}
      </div>
    </div>
    <div class="card hours">${hours}</div>
    <div class="days">${days}</div>
    ${w.ok ? '' : `<div class="small muted">Showing cached data — ${esc(w.error)}</div>`}`;

  panel.querySelector('#refresh').onclick = () => api.refreshWeather();
  panel.querySelector('#change').onclick = () => { current = 'settings'; renderSettings(); };
}

// ---------------------------------------------------------------- system
function renderSystem() {
  const s = state.stats;
  if (!s) { panel.innerHTML = '<div class="muted">Collecting stats…</div>'; return; }
  const hist = s.cpuHistory.length > 1 ? s.cpuHistory : [s.cpu, s.cpu];
  const W = 270, H = 54;
  const pts = hist.map((v, i) => `${((i / (hist.length - 1)) * W).toFixed(1)},${(H - 2 - (v / 100) * (H - 4)).toFixed(1)}`);
  const memPct = (100 * s.memUsed) / s.memTotal;
  const disk = s.disk;
  const diskPct = disk ? (100 * (disk.total - disk.free)) / disk.total : 0;
  const barColor = (p) => (p > 85 ? 'var(--bad)' : p > 65 ? 'var(--warn)' : 'var(--accent)');

  panel.innerHTML = `
    <div>
      <div class="row between"><span class="title">CPU</span><span class="title">${Math.round(s.cpu)}%</span></div>
      <div class="muted small ellipsis">${esc(s.cpuModel)} · ${s.cores} threads</div>
    </div>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="var(--accent)" opacity=".18"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div>
      <div class="row between"><span>Memory</span><span class="muted small">${fmtBytes(s.memUsed)} / ${fmtBytes(s.memTotal)}</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${memPct}%;background:${barColor(memPct)}"></i></div>
    </div>
    ${disk ? `<div>
      <div class="row between"><span>Disk ${esc(disk.label)}</span><span class="muted small">${fmtBytes(disk.free)} free of ${fmtBytes(disk.total)}</span></div>
      <div class="bar" style="margin-top:6px"><i style="width:${diskPct}%;background:${barColor(diskPct)}"></i></div>
    </div>` : ''}
    <div class="row between"><span>Uptime</span><span class="muted">${fmtUptime(s.uptime)}</span></div>`;
}

function saverNote() {
  const mode = state.config.batterySaver;
  if (state.saver) {
    return `<b style="color:var(--fg)">On now.</b> Stats update every 10 s, apps every 5 s and AI usage every 5 min. Glass and animations are off.`;
  }
  if (mode === 'auto') return 'Turns on by itself when your PC runs on battery.';
  if (mode === 'off') return 'Always full speed, even on battery.';
  return '';
}

// ---------------------------------------------------------------- AI usage
const WEB = {
  claude: { name: 'Claude', host: 'claude.ai', icon: () => icons.claude, note: '' },
  chatgpt: {
    name: 'ChatGPT', host: 'chatgpt.com', icon: () => icons.codex,
    note: 'ChatGPT doesn’t report its per-model chat message caps, so these are the plan usage limits it does report (shared with Codex and agent features).',
  },
  grok: {
    name: 'Grok', host: 'grok.com', icon: () => icons.grok,
    note: 'Grok limits are rolling: each question frees up again once it is older than the window. If you never signed in, these are the guest limits.',
  },
};

function agoText(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function webSection(id, barColor) {
  const s = (state.ai && state.ai.web && state.ai.web[id]) || {};
  const svc = WEB[id];
  if (!s.connected) return '';
  const head = `<div class="row" style="gap:8px">${svc.icon()}<span class="title">${svc.name}</span>
      <span class="muted small grow ellipsis">${esc(s.plan ? `${s.plan} plan` : svc.host)}</span>
      <button class="iconbtn" data-act="refresh" title="Refresh">${icons.refresh}</button></div>`;
  let body;
  if (s.status === 'pending') body = '<div class="muted small">Checking…</div>';
  else if (s.status === 'signed_out') {
    body = `<div class="small muted">You're signed out of ${svc.host}.</div>
      <div><button class="btn small" data-act="signin" data-id="${id}">Sign in</button></div>`;
  } else if (s.status === 'blocked') {
    body = `<div class="small muted">${svc.host} wants a quick security check. Open it once and it will continue.</div>
      <div><button class="btn small" data-act="open" data-id="${id}">Open ${svc.host}</button></div>`;
  } else if (!s.windows || !s.windows.length) {
    body = `<div class="small muted">Couldn't read limits${s.httpStatus ? ` (HTTP ${s.httpStatus})` : s.error ? ` (${esc(s.error)})` : ''}. ${svc.host} may have changed its site.</div>`;
  } else {
    body = s.windows.map(liveWindow).map((w) => `<div>
        <div class="row between"><span>${esc(w.label)}</span><span class="small muted">${w.detail ? esc(w.detail) : `${Math.round(w.pct)}% used`}${w.resetsAt ? ` · resets in ${fmtIn(w.resetsAt)}` : ''}</span></div>
        <div class="bar" style="margin-top:5px"><i style="width:${w.pct}%;background:${barColor(w.pct)}"></i></div>
      </div>`).join('');
    if (svc.note) body += `<div class="small muted">${svc.note}</div>`;
  }
  const foot = s.at ? `<div class="small muted">Updated ${agoText(s.at)}${s.status !== 'ok' && s.windows && s.windows.length ? ' · showing last good values' : ''}</div>` : '';
  return `<section data-id="${id}" style="display:flex;flex-direction:column;gap:8px">${head}${body}${foot}</section>`;
}

function renderAi() {
  const a = state.ai || {};
  const c = a.claude || {};
  const x = a.codex || {};
  const g = a.gemini || {};
  const webIds = Object.keys(WEB);
  const budget = state.config.claudeBudget || 0;
  const at = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !state.config.clock24 });
  const day = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short' });
  const barColor = (p) => (p > 85 ? 'var(--bad)' : p > 65 ? 'var(--warn)' : 'var(--accent)');
  panel.classList.add('scroll');
  let html = webIds.map((id) => webSection(id, barColor)).join('');
  const hasWeb = webIds.some((id) => a.web && a.web[id] && a.web[id].connected);
  if (hasWeb && (c.found || x.found || g.found)) html += '<div class="sep-h"></div>';

  if (c.found) {
    let win;
    if (c.active && c.resetsAt > Date.now()) {
      const w = c.window;
      const pct = budget > 0 ? Math.min(100, (100 * w.total) / budget) : null;
      win = `
        <div class="row between">
          <span class="big" style="font-size:26px">${fmtTokens(w.total)}<span class="muted small" style="font-weight:400"> tokens${budget > 0 ? ` of ${fmtTokens(budget)}` : ''}</span></span>
          <span class="small muted" style="text-align:right">resets in <b style="color:var(--fg)">${fmtIn(c.resetsAt)}</b><br>at ${esc(at(c.resetsAt))}</span>
        </div>
        ${pct !== null ? `<div class="bar"><i style="width:${pct}%;background:${barColor(pct)}"></i></div>` : ''}
        <div class="small muted">${w.messages} replies · in ${fmtTokens(w.input)} · out ${fmtTokens(w.output)} · cache write ${fmtTokens(w.cacheWrite)} · cache read ${fmtTokens(w.cacheRead)}</div>`;
    } else {
      win = `<div class="muted">No Claude Code activity in the last 5 hours.${c.lastActivity ? ` Last used ${esc(day(c.lastActivity))} ${esc(at(c.lastActivity))}.` : ''}</div>`;
    }
    const models = (c.byModel || []).map(([m, n]) => `${esc(m)} ${fmtTokens(n)}`).join(' · ');
    html += `
      <div class="row" style="gap:8px">${icons.claude}<span class="title">Claude Code</span><span class="muted small">current 5-hour window</span></div>
      ${win}
      <div class="card small" style="display:grid;gap:3px">
        <div class="row between"><span>Today</span><span>${fmtTokens(c.today.total)} · ${c.today.messages} replies</span></div>
        <div class="row between"><span>Last 7 days</span><span>${fmtTokens(c.week.total)} · ${c.week.messages} replies</span></div>
        ${models ? `<div class="muted ellipsis">${models}</div>` : ''}
      </div>
      <div class="row small"><span class="grow muted">My budget per 5 h (tokens)</span>
        <input type="text" id="budget" value="${budget || ''}" placeholder="none" style="width:110px;padding:4px 8px" inputmode="numeric"></div>`;
  }

  if (x.found && !x.empty) {
    const line = (label, w) => {
      w = liveWindow(w);
      if (!w) return '';
      const resets = w.resetsAt ? `resets in ${fmtIn(w.resetsAt)}` : w.reset ? 'has reset' : '';
      return `<div>
        <div class="row between"><span>${label}</span><span class="small muted">${Math.round(w.pct)}% used · ${resets}</span></div>
        <div class="bar" style="margin-top:5px"><i style="width:${w.pct}%;background:${barColor(w.pct)}"></i></div>
      </div>`;
    };
    const name = (w, fallback) => (w && w.windowMinutes ? (w.windowMinutes >= 1440 ? 'Weekly' : `${Math.round(w.windowMinutes / 60)}-hour`) : fallback);
    html += `
      <div class="row" style="gap:8px;margin-top:4px">${icons.codex}<span class="title">Codex</span><span class="muted small">ChatGPT plan limits</span></div>
      ${line(`${name(x.primary, '5-hour')} limit`, x.primary)}
      ${line(`${name(x.secondary, 'Weekly')} limit`, x.secondary)}
      <div class="small muted">As of your last Codex request, ${esc(day(x.at))} ${esc(at(x.at))}.</div>`;
  } else if (x.found) {
    html += '<div class="small muted">Codex is installed but has no recent sessions with limit info yet.</div>';
  }

  if (g.found && !g.empty) {
    const limit = state.config.geminiDailyLimit || 0;
    const chats = g.source === 'chats';
    const fresh = g.resetsAt > Date.now(); // a new Pacific day may have started since the last scan
    const used = !fresh ? 0 : chats ? g.today.requests : g.promptsToday;
    const pct = limit > 0 && chats ? Math.min(100, (100 * used) / limit) : null;
    const models = (g.byModel || []).map(([m, n]) => `${esc(m.replace(/^gemini-/, ''))} ${n}`).join(' · ');
    html += `
      <div class="row" style="gap:8px;margin-top:4px">${icons.gemini}<span class="title">Gemini CLI</span><span class="muted small">today (Pacific time)</span></div>
      <div class="row between">
        <span class="big" style="font-size:26px">${used}<span class="muted small" style="font-weight:400"> ${chats ? 'requests' : 'prompts'}${pct !== null ? ` of ${limit.toLocaleString()}` : ''}</span></span>
        <span class="small muted" style="text-align:right">resets in <b style="color:var(--fg)">${fmtIn(g.resetsAt)}</b><br>at ${esc(at(g.resetsAt))}</span>
      </div>
      ${pct !== null ? `<div class="bar"><i style="width:${pct}%;background:${barColor(pct)}"></i></div>` : ''}
      ${chats ? `<div class="small muted">${fmtTokens(g.today.tokens)} tokens today · in ${fmtTokens(g.today.input)} · out ${fmtTokens(g.today.output)} · cached ${fmtTokens(g.today.cached)}</div>
      <div class="card small" style="display:grid;gap:3px">
        <div class="row between"><span>Last 7 days</span><span>${g.week.requests} requests · ${fmtTokens(g.week.tokens)} tokens</span></div>
        ${models ? `<div class="muted ellipsis">${models}</div>` : ''}
      </div>` : '<div class="small muted">Your Gemini CLI version only logs prompts, not each request or tokens. Update Gemini CLI for full numbers.</div>'}
      <div class="row small"><span class="grow muted">Daily request limit</span>
        <input type="text" id="glimit" value="${limit || ''}" placeholder="none" style="width:110px;padding:4px 8px" inputmode="numeric"></div>
      <div class="small muted">1,000/day is Google's free limit for signing in with a Google account. Change it if your plan or API key has a different limit.</div>`;
  } else if (g.found) {
    html += '<div class="small muted">Gemini CLI is installed but has no chats in the last week.</div>';
  }

  if (!hasWeb && !c.found && !(x.found && !x.empty) && !(g.found && !g.empty)) {
    html = `<div class="title">AI usage</div>
      <div class="muted">Nothing connected yet.</div>`;
  }
  const notConnected = webIds.filter((id) => !(a.web && a.web[id] && a.web[id].connected));
  if (notConnected.length) {
    html += `<div class="card small" style="display:flex;flex-direction:column;gap:8px">
      <div>See your plan limits from the websites:</div>
      <div class="row" style="flex-wrap:wrap">${notConnected.map((id) => `<button class="btn small" data-act="signin" data-id="${id}">Connect ${WEB[id].host}</button>`).join('')}</div>
    </div>`;
  }
  html += `<div class="small muted" style="margin-top:auto">Claude Code, Codex and Gemini CLI are read from local logs. Website limits use the sign-in you make in GlassDock and go only to that site.</div>`;
  panel.innerHTML = html;
  wireWebButtons();

  const gl = panel.querySelector('#glimit');
  if (gl) {
    gl.addEventListener('change', () => {
      const n = parseInt(gl.value.replace(/[^\d]/g, ''), 10);
      api.setConfig({ geminiDailyLimit: Number.isFinite(n) ? n : 0 });
    });
    gl.addEventListener('keydown', (e) => { if (e.key === 'Enter') gl.blur(); });
  }
  const b = panel.querySelector('#budget');
  if (b) {
    b.addEventListener('change', () => {
      const raw = b.value.trim().toLowerCase().replace(/[, _]/g, '');
      const m = /^(\d+(?:\.\d+)?)([km]?)$/.exec(raw);
      const n = m ? Math.round(parseFloat(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1)) : 0;
      api.setConfig({ claudeBudget: n });
    });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') b.blur(); });
  }
}

function wireWebButtons() {
  panel.querySelectorAll('[data-act]').forEach((b) => {
    const id = b.dataset.id || b.closest('section')?.dataset.id;
    b.onclick = () => {
      if (b.dataset.act === 'refresh') { b.disabled = true; api.webRefresh(); }
      if (b.dataset.act === 'signin') api.webConnect(id);
      if (b.dataset.act === 'open') api.webConnect(id, 'home');
      if (b.dataset.act === 'disconnect') api.webDisconnect(id);
    };
  });
}

// ---------------------------------------------------------------- sound (volume + now playing)
// Built once when opened, then patched in place on every update, so dragging the volume
// slider or hovering a button is never interrupted by a redraw.
let soundDragging = false;
let soundSendTimer = null;
let soundTicker = null;
let soundHeight = 0;

function renderSound() {
  panel.classList.add('sound-mode');
  panel.innerHTML = `
    <div class="np" id="np">
      <div class="np-top">
        <div class="np-art" id="npArt"></div>
        <div class="np-info">
          <div class="np-title" id="npTitle"></div>
          <div class="np-artist" id="npArtist"></div>
          <div class="np-app small muted" id="npApp"></div>
        </div>
      </div>
      <div class="np-seek" id="npSeekWrap">
        <div class="seekbar" id="npSeek"><i id="npFill"></i><b id="npKnob"></b></div>
        <div class="row between small muted"><span id="npPos">0:00</span><span id="npDur">0:00</span></div>
      </div>
      <div class="np-ctrls">
        <button class="mbtn" id="npPrev" title="Previous">${mediaIcon('prev', 20)}</button>
        <button class="mbtn big" id="npPlay" title="Play/Pause"></button>
        <button class="mbtn" id="npNext" title="Next">${mediaIcon('next', 20)}</button>
      </div>
    </div>
    <div class="np-empty" id="npEmpty">
      <div class="np-art none">${mediaIcon('music', 30)}</div>
      <div><div class="title">Nothing playing</div>
      <div class="small muted">Play something in Spotify, a browser or any media app and it shows up here.</div></div>
    </div>
    <div class="sep-h"></div>
    <div class="vol">
      <button class="iconbtn" id="volMute" title="Mute"></button>
      <input type="range" id="volSlider" min="0" max="100" step="1" class="slider">
      <span class="vol-pct" id="volPct"></span>
    </div>
    <div class="small muted" id="volNote" style="display:none">Volume control isn't available right now.</div>`;

  panel.querySelector('#npPrev').onclick = () => api.mediaCmd('prev');
  panel.querySelector('#npNext').onclick = () => api.mediaCmd('next');
  panel.querySelector('#npPlay').onclick = () => {
    // flip the icon right away; the real state follows a moment later
    const m = state.sound && state.sound.media;
    if (m) { m.status = m.status === 'Playing' ? 'Paused' : 'Playing'; if (m.status === 'Paused') { m.position = mediaPosition({ ...m, status: 'Playing' }); } m.updated = Date.now(); updateSound(); }
    api.mediaCmd('play');
  };
  panel.querySelector('#volMute').onclick = () => api.toggleMute();

  const slider = panel.querySelector('#volSlider');
  const paint = () => { slider.style.setProperty('--p', `${slider.value}%`); panel.querySelector('#volPct').textContent = `${slider.value}%`; };
  slider.addEventListener('pointerdown', () => { soundDragging = true; });
  slider.addEventListener('input', () => {
    paint();
    clearTimeout(soundSendTimer);
    soundSendTimer = setTimeout(() => api.setVolume(slider.value / 100), 40); // at most ~25 updates a second
  });
  const endDrag = () => { if (!soundDragging) return; soundDragging = false; api.setVolume(slider.value / 100); };
  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('change', endDrag);
  slider.addEventListener('wheel', (e) => { e.preventDefault(); api.volumeStep(e.deltaY < 0 ? 0.02 : -0.02); }, { passive: false });

  // click or drag on the progress bar to seek
  const seek = panel.querySelector('#npSeek');
  const seekTo = (e) => {
    const m = state.sound && state.sound.media;
    if (!m || !m.canSeek || !(m.duration > 0)) return;
    const r = seek.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    m.position = f * m.duration; m.updated = Date.now();
    updateSound();
    api.mediaSeek(f * m.duration);
  };
  seek.addEventListener('click', seekTo);

  clearInterval(soundTicker);
  soundTicker = setInterval(() => { if (current === 'sound') updateProgress(); }, 500);
  updateSound(true);
}

function updateProgress() {
  const m = state.sound && state.sound.media;
  if (!m || !(m.duration > 0)) return;
  const pos = mediaPosition(m);
  const pct = `${(100 * pos / m.duration).toFixed(2)}%`;
  panel.querySelector('#npFill').style.width = pct;
  panel.querySelector('#npKnob').style.left = pct;
  panel.querySelector('#npPos').textContent = fmtDuration(pos);
}

function updateSound(first = false) {
  if (current !== 'sound' || !panel.querySelector('#np')) return;
  const snd = state.sound || {};
  const m = snd.media && (snd.media.title || snd.media.artist) ? snd.media : null;
  const $ = (id) => panel.querySelector(id);
  $('#np').style.display = m ? '' : 'none';
  $('#npEmpty').style.display = m ? 'none' : '';
  if (m) {
    const art = $('#npArt');
    const want = m.thumb || '';
    if (art.dataset.src !== want) {
      art.dataset.src = want;
      art.classList.toggle('none', !want);
      art.innerHTML = want ? `<img src="${esc(want)}" alt="">` : mediaIcon('music', 30);
    }
    $('#npTitle').textContent = m.title || m.appName || 'Unknown';
    $('#npArtist').textContent = [m.artist, m.album].filter(Boolean).join(' — ');
    $('#npApp').textContent = m.appName ? `Playing in ${m.appName}` : '';
    $('#npPlay').innerHTML = mediaIcon(m.status === 'Playing' ? 'pause' : 'play', 26);
    $('#npPlay').title = m.status === 'Playing' ? 'Pause' : 'Play';
    $('#npPrev').disabled = !m.canPrev;
    $('#npNext').disabled = !m.canNext;
    $('#npSeekWrap').style.display = m.duration > 0 ? '' : 'none';
    $('#npSeek').classList.toggle('fixed', !m.canSeek);
    $('#npDur').textContent = fmtDuration(m.duration);
    updateProgress();
  }
  const v = snd.volume;
  $('#volNote').style.display = v ? 'none' : '';
  $('#volSlider').disabled = !v;
  if (v) {
    $('#volMute').innerHTML = speakerIcon(v.level, v.muted, 20);
    $('#volMute').title = v.muted ? 'Unmute' : 'Mute';
    $('#volMute').classList.toggle('muted', !!v.muted);
    if (!soundDragging) {
      const s = $('#volSlider');
      s.value = Math.round(v.level * 100);
      s.style.setProperty('--p', `${s.value}%`);
      $('#volPct').textContent = v.muted ? 'Muted' : `${s.value}%`;
    }
    $('.vol').classList.toggle('muted', !!v.muted);
  }
  requestAnimationFrame(() => {
    const h = panel.scrollHeight + 2;
    if (first || h !== soundHeight) { soundHeight = h; api.panelSize(h); }
  });
}

// ---------------------------------------------------------------- glass menus
// Submenus open in place (with a back row) so the menu stays one tidy card.
let menuStack = []; // [{ title, items }]
let menuFocus = -1;

function renderMenu() {
  panel.classList.add('menu-mode');
  const m = state.menu || { items: [] };
  if (!menuStack.length) menuStack = [{ title: null, items: m.items }];
  const level = menuStack[menuStack.length - 1];
  let html = '';
  if (menuStack.length > 1) {
    html += `<div class="mi back" data-back="1">${glyph('back')}<span class="ml">${esc(level.title)}</span></div><div class="msep"></div>`;
  } else if (m.header) {
    const h = m.header;
    html += `<div class="mhead">${h.icon ? `<img src="${esc(h.icon)}" alt="">` : `<span class="letter">${esc((h.title || '?').charAt(0).toUpperCase())}</span>`}
      <div class="grow"><div class="mt ellipsis">${esc(h.title)}</div>${h.sub ? `<div class="small muted">${esc(h.sub)}</div>` : ''}</div></div><div class="msep"></div>`;
  }
  html += level.items.map((it, i) => {
    if (it.type === 'separator') return '<div class="msep"></div>';
    const cls = ['mi'];
    if (!it.enabled) cls.push('off');
    if (it.danger) cls.push('danger');
    if (it.type === 'radio' && it.checked) cls.push('on');
    let right = '';
    if (it.submenu) right = `<span class="mr">${glyph('chevron', 14)}</span>`;
    else if (it.type === 'checkbox') right = `<span class="switch${it.checked ? ' on' : ''}"><i></i></span>`;
    else if (it.type === 'radio') right = `<span class="radio${it.checked ? ' on' : ''}"></span>`;
    const icon = it.glyph ? `<span class="mg">${glyph(it.glyph)}</span>` : (level.items.some((x) => x.glyph) ? '<span class="mg"></span>' : '');
    return `<div class="${cls.join(' ')}" data-i="${i}">${icon}<span class="ml">${esc(it.label)}</span>${right}</div>`;
  }).join('');
  panel.innerHTML = html;
  menuFocus = -1;

  panel.querySelectorAll('.mi').forEach((el) => {
    el.addEventListener('mouseenter', () => setMenuFocus([...panel.querySelectorAll('.mi:not(.off)')].indexOf(el)));
    el.addEventListener('click', () => activateMenuItem(el));
  });
  requestAnimationFrame(() => api.menuSize(panel.scrollHeight + 2));
}

function activateMenuItem(el) {
  if (!el || el.classList.contains('off')) return;
  if (el.dataset.back) { menuStack.pop(); renderMenu(); return; }
  const it = menuStack[menuStack.length - 1].items[Number(el.dataset.i)];
  if (!it) return;
  if (it.submenu) { menuStack.push({ title: it.label, items: it.submenu }); renderMenu(); return; }
  api.menuPick(it.id);
}

function setMenuFocus(i) {
  const els = [...panel.querySelectorAll('.mi:not(.off)')];
  if (!els.length) return;
  menuFocus = (i + els.length) % els.length;
  els.forEach((e, k) => e.classList.toggle('focus', k === menuFocus));
}

document.addEventListener('keydown', (e) => {
  if (current !== 'menu') return;
  const els = [...panel.querySelectorAll('.mi:not(.off)')];
  if (e.key === 'ArrowDown') { setMenuFocus(menuFocus + 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { setMenuFocus(menuFocus < 0 ? -1 : menuFocus - 1); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
    const el = els[menuFocus];
    if (el && (e.key !== 'ArrowRight' || menuStack[menuStack.length - 1].items[Number(el.dataset.i)]?.submenu)) activateMenuItem(el);
    e.preventDefault();
  } else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && menuStack.length > 1) { menuStack.pop(); renderMenu(); e.preventDefault(); }
});

// ---------------------------------------------------------------- app picker
let appsQuery = '';
let appsItems = null;

function renderApps() {
  panel.classList.add('noscroll');
  const isWin = api.platform === 'win32';
  panel.innerHTML = `
    <div class="row between"><span class="title">Pin apps</span>
      <span class="small muted">${(state.config.pinnedApps || []).length} pinned</span></div>
    ${isWin ? `<input type="text" id="aq" placeholder="Search your apps…" autocomplete="off" spellcheck="false" value="${esc(appsQuery)}">` : ''}
    <div class="row" style="gap:6px">
      <button class="btn ghost small" id="browse">${icons.plus}&nbsp;Browse for an app…</button>
      <button class="btn ghost small" id="folder">${icons.folder}&nbsp;Pin a folder…</button>
    </div>
    <div class="applist" id="alist">${isWin ? '<div class="muted small" style="padding:8px">Loading your apps…</div>' : ''}</div>
    <div class="small muted">Tip: drag any app, shortcut, file or folder from Explorer onto the dock. Right-click a pinned app to unpin it.</div>`;
  panel.querySelector('#browse').onclick = () => api.pinDialog('file');
  panel.querySelector('#folder').onclick = () => api.pinDialog('folder');
  if (!isWin) {
    panel.querySelector('#alist').innerHTML = '<div class="muted small" style="padding:8px">The installed-apps list is only available on Windows. Use Browse, or drop files on the dock.</div>';
    return;
  }
  const q = panel.querySelector('#aq');
  q.addEventListener('input', () => { appsQuery = q.value; drawAppList(); });
  setTimeout(() => { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 50);
  if (appsItems) drawAppList();
  api.appsCatalog().then((items) => { appsItems = items; if (current === 'apps') drawAppList(); })
    .catch(() => { panel.querySelector('#alist').innerHTML = '<div class="muted small" style="padding:8px">Couldn’t read your Start menu.</div>'; });
}

function drawAppList() {
  const list = panel.querySelector('#alist');
  if (!list || !appsItems) return;
  const q = appsQuery.trim().toLowerCase();
  const items = q ? appsItems.filter((it) => it.name.toLowerCase().includes(q)) : appsItems;
  // pinned first, then alphabetical
  items.sort((a, b) => (b.pinned - a.pinned) || a.name.localeCompare(b.name));
  list.innerHTML = items.length ? items.map((it) => `
    <button class="approw${it.pinned ? ' on' : ''}" data-key="${esc(it.key)}" title="${it.pinned ? 'Unpin' : 'Pin'} ${esc(it.name)}">
      ${it.icon ? `<img src="${esc(it.icon)}" alt="">` : `<span class="letter">${esc(it.name.charAt(0).toUpperCase())}</span>`}
      <span class="name">${esc(it.name)}</span>
      <span class="state">${it.pinned ? icons.check : icons.plus}</span>
    </button>`).join('') : '<div class="muted small" style="padding:8px">No matching apps. Try Browse.</div>';
  list.querySelectorAll('.approw').forEach((b) => {
    b.onclick = () => {
      const it = appsItems.find((x) => x.key === b.dataset.key);
      if (!it) return;
      it.pinned = !it.pinned; // update now; the dock follows via the config broadcast
      b.classList.toggle('on', it.pinned);
      b.querySelector('.state').innerHTML = it.pinned ? icons.check : icons.plus;
      api.toggleCatalogApp(it.key);
    };
  });
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const loc = state.config.location;
  const units = state.config.units;
  panel.innerHTML = `
    <div class="title">Settings</div>
    <div>
      <div class="small muted" style="margin-bottom:6px">Weather location</div>
      ${loc ? `<div class="row" style="margin-bottom:8px;gap:5px">${icons.pin}<span class="ellipsis">${esc([loc.name, loc.admin, loc.country].filter(Boolean).join(', '))}</span></div>` : ''}
      <input type="text" id="q" placeholder="Search for a city…" autocomplete="off" spellcheck="false">
      <div class="results" id="results" style="margin-top:6px"></div>
    </div>
    <div class="row between">
      <span>Temperature</span>
      <div class="seg">
        <button data-u="celsius" class="${units === 'celsius' ? 'on' : ''}">°C</button>
        <button data-u="fahrenheit" class="${units === 'fahrenheit' ? 'on' : ''}">°F</button>
      </div>
    </div>
    <div>
      <div class="small muted" style="margin-bottom:6px">Contact for Yr / MET Norway <span title="MET Norway asks apps that use its free forecasts to include contact details, so they can reach out about heavy use instead of blocking. It's sent only to api.met.no.">(optional, ⓘ)</span></div>
      <input type="text" id="yrContact" placeholder="Your email or website" value="${esc(state.config.yrContact || '')}" autocomplete="off" spellcheck="false">
    </div>
    <div>
      <div class="row between"><span class="row" style="gap:6px">${glyph('leaf')}Battery saver</span>
        <div class="seg" id="saverSeg">
          ${[['off', 'Off'], ['auto', 'Auto'], ['on', 'On']].map(([v, l]) => `<button data-s="${v}" class="${state.config.batterySaver === v ? 'on' : ''}">${l}</button>`).join('')}
        </div></div>
      <div class="small muted" id="saverNote" style="margin-top:6px">${saverNote()}</div>
    </div>
    <div class="row between">
      <span class="row" style="gap:6px">${glyph('lock')}Lock the dock</span>
      <span class="switch big${state.config.locked ? ' on' : ''}" id="lockSw" role="switch" aria-checked="${!!state.config.locked}"><i></i></span>
    </div>
    <div>
      <div class="small muted" style="margin-bottom:6px">AI accounts</div>
      ${Object.entries(WEB).map(([id, svc]) => {
        const on = state.ai && state.ai.web && state.ai.web[id] && state.ai.web[id].connected;
        return `<div class="row between" style="margin-bottom:4px"><span>${svc.host}</span>${on
          ? `<button class="btn ghost small" data-act="disconnect" data-id="${id}">Disconnect</button>`
          : `<button class="btn small" data-act="signin" data-id="${id}">Connect</button>`}</div>`;
      }).join('')}
    </div>
    <div class="small muted" style="margin-top:auto">
      Style, size, position, widgets and the taskbar are in the dock's right-click menu.
      Drag widgets on the dock to reorder them.<br>GlassDock ${esc(state.version)} · weather by Open-Meteo
    </div>`;

  const q = panel.querySelector('#q');
  const results = panel.querySelector('#results');
  let timer = null;
  let seq = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const text = q.value.trim();
    if (text.length < 2) { results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      results.innerHTML = '<div class="muted small">Searching…</div>';
      try {
        const list = await api.geocode(text);
        if (mine !== seq) return;
        results.innerHTML = list.length ? '' : '<div class="muted small">No matches.</div>';
        for (const r of list) {
          const b = document.createElement('button');
          b.className = 'result';
          b.innerHTML = `${esc(r.name)} <span class="muted small">${esc([r.admin, r.country].filter(Boolean).join(', '))}</span>`;
          b.onclick = () => { api.setConfig({ location: r }); current = 'weather'; };
          results.appendChild(b);
        }
      } catch (e) {
        if (mine === seq) results.innerHTML = `<div class="muted small">Search failed: ${esc(e.message)}</div>`;
      }
    }, 300);
  });
  panel.querySelectorAll('.seg button[data-u]').forEach((b) => { b.onclick = () => api.setConfig({ units: b.dataset.u }); });
  const yc = panel.querySelector('#yrContact');
  yc.addEventListener('change', () => api.setConfig({ yrContact: yc.value.trim().slice(0, 100) }));
  yc.addEventListener('keydown', (e) => { if (e.key === 'Enter') yc.blur(); });
  panel.querySelectorAll('#saverSeg button').forEach((b) => { b.onclick = () => api.setConfig({ batterySaver: b.dataset.s }); });
  panel.querySelector('#lockSw').onclick = () => api.setConfig({ locked: !state.config.locked });
  wireWebButtons();
  setTimeout(() => q.focus(), 50);
}

// ---------------------------------------------------------------- routing
const RENDER = { calendar: renderCalendar, weather: renderWeather, system: renderSystem, settings: renderSettings, ai: renderAi, apps: renderApps, menu: renderMenu, sound: renderSound, yr: renderYr };

function show() {
  if (current !== 'calendar') clearInterval(clockTimer);
  panel.classList.remove('scroll', 'noscroll', 'menu-mode', 'sound-mode', 'yr-mode');
  (RENDER[current] || renderSettings)();
}

api.onPanel((p) => {
  state = p;
  current = p.name;
  menuStack = [];
  document.body.dataset.saver = p.saver ? '1' : '0';
  calMonth = null;
  calSelected = null;
  calView = 'month';
  applyTheme(state.config);
  // restart the open animation
  panel.style.animation = 'none';
  void panel.offsetWidth;
  panel.style.animation = '';
  show();
});
api.onConfig((c) => {
  if (!state) return;
  state.config = c;
  applyTheme(c);
  if (current === 'menu') return; // a menu shows a snapshot; it closes on any pick
  if (current === 'sound') { updateSound(); return; }
  if (current === 'apps') { const n = panel.querySelector('.title + .small'); if (n) n.textContent = `${(c.pinnedApps || []).length} pinned`; return; }
  if (document.activeElement?.tagName !== 'INPUT') show();
});
api.onStats((s) => { if (state) { state.stats = s; if (current === 'system') show(); } });
api.onYr((y) => { if (!state) return; state.yr = y; if (current === 'yr') show(); });
api.onEvents((ev) => { if (!state) return; state.events = ev; if (current === 'calendar' && document.activeElement?.tagName !== 'INPUT') show(); });
api.onSound((snd) => { if (!state) return; state.sound = snd; if (current === 'sound') updateSound(); });
api.onSaver((v) => { if (!state) return; state.saver = v; document.body.dataset.saver = v ? '1' : '0'; const n = document.getElementById('saverNote'); if (n) n.innerHTML = saverNote(); });
api.onAi((a) => { if (state) { state.ai = a; if ((current === 'ai' || current === 'settings') && document.activeElement?.tagName !== 'INPUT') show(); } });
api.onWeather((w) => { if (state) { state.weather = w; if (current === 'weather') show(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closePanel(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
