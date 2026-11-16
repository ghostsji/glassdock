// Weather forecast from Yr (MET Norway's Locationforecast 2.0, the data behind yr.no).
//
// MET Norway's terms of service, which we follow:
//  - identify the app in the User-Agent (with contact details when the user gives them),
//  - use at most 4 decimals for coordinates,
//  - don't ask again before the "Expires" time, and send If-Modified-Since so unchanged
//    forecasts come back as a tiny "304 Not Modified",
//  - credit "Yr, delivered by the Norwegian Meteorological Institute and NRK" (done in the UI).
const API = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

const round4 = (n) => Math.round(Number(n) * 1e4) / 1e4;

function userAgent(version, contact) {
  const c = String(contact || '').replace(/[^\w.@+\-:/ ]/g, '').trim().slice(0, 100);
  return `GlassDock/${version} (Windows desktop dock${c ? `; ${c}` : ''})`;
}

// Local calendar date and hour of a timestamp in the forecast location's time zone.
function localParts(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// Turn MET's timeseries into what the widgets draw: up to 48 hourly steps and 9 days.
function summarise(json, timeZone) {
  const ts = (json && json.properties && json.properties.timeseries) || [];
  const steps = ts.map((t) => {
    const d = t.data || {};
    const inst = (d.instant && d.instant.details) || {};
    const n1 = d.next_1_hours;
    const n6 = d.next_6_hours;
    const n12 = d.next_12_hours;
    return {
      t: Date.parse(t.time),
      temp: inst.air_temperature,
      wind: inst.wind_speed,
      gust: inst.wind_speed_of_gust ?? null,
      windDir: inst.wind_from_direction,
      humidity: inst.relative_humidity,
      symbol1: n1 && n1.summary && n1.summary.symbol_code,
      precip1: n1 && n1.details ? n1.details.precipitation_amount : null,
      symbol6: n6 && n6.summary && n6.summary.symbol_code,
      precip6: n6 && n6.details ? n6.details.precipitation_amount : null,
      symbol12: n12 && n12.summary && n12.summary.symbol_code,
    };
  }).filter((s) => Number.isFinite(s.t) && Number.isFinite(s.temp));

  const now = Date.now();
  const hours = steps
    .filter((s) => s.symbol1 && s.t >= now - 3600e3)
    .slice(0, 48)
    .map((s) => ({ t: s.t, temp: s.temp, wind: s.wind, gust: s.gust, windDir: s.windDir, humidity: s.humidity, symbol: s.symbol1, precip: s.precip1 ?? 0 }));

  // Days: min/max from every step, rain from 1-hour amounts where MET gives them and 6-hour
  // amounts after that (counted once per 6 hours), symbols for night/morning/afternoon/evening.
  const days = new Map();
  let covered = 0; // precipitation already counted up to this time
  for (const s of steps) {
    const { date, hour } = localParts(s.t, timeZone);
    if (!days.has(date)) days.set(date, { date, min: Infinity, max: -Infinity, precip: 0, windMax: 0, periods: {} });
    const day = days.get(date);
    day.min = Math.min(day.min, s.temp);
    day.max = Math.max(day.max, s.temp);
    day.windMax = Math.max(day.windMax, s.wind || 0);
    if (s.t >= covered) {
      if (s.precip1 != null) { day.precip += s.precip1; covered = s.t + 3600e3; }
      else if (s.precip6 != null) { day.precip += s.precip6; covered = s.t + 6 * 3600e3; }
    }
    const period = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const sym = s.symbol6 || s.symbol1 || s.symbol12;
    // prefer the step that starts its period (00/06/12/18), else the first one we see
    const startOfPeriod = hour % 6 === 0;
    if (sym && (!day.periods[period] || (startOfPeriod && !day.periods[period].exact))) {
      day.periods[period] = { symbol: sym, exact: startOfPeriod };
    }
  }
  const dayList = [...days.values()].slice(0, 10).map((d) => ({
    date: d.date, min: d.min, max: d.max, precip: Math.round(d.precip * 10) / 10, windMax: d.windMax,
    periods: Object.fromEntries(Object.entries(d.periods).map(([k, v]) => [k, v.symbol])),
  }));

  return {
    updatedAt: Date.parse(json && json.properties && json.properties.meta && json.properties.meta.updated_at) || null,
    hours,
    days: dayList,
  };
}

// fetchImpl(url, { headers }) -> Response-like; prev = the last result (for caching).
async function fetchForecast({ lat, lon, timeZone, version, contact, prev, fetchImpl }) {
  const la = round4(lat);
  const lo = round4(lon);
  const key = `${la},${lo}`;
  const sameSpot = prev && prev.key === key;
  if (sameSpot && prev.expires && Date.now() < prev.expires && prev.raw) {
    return { ...prev, fromCache: true };
  }
  const headers = { 'User-Agent': userAgent(version, contact), Accept: 'application/json' };
  if (sameSpot && prev.lastModified) headers['If-Modified-Since'] = prev.lastModified;
  const res = await fetchImpl(`${API}?lat=${la}&lon=${lo}`, { headers });
  const expires = Date.parse(res.headers.get('expires')) || Date.now() + 30 * 60 * 1000;
  if (res.status === 304 && sameSpot && prev.raw) {
    return { ...prev, ...summarise(prev.raw, timeZone), expires, fetchedAt: Date.now(), fromCache: false };
  }
  if (res.status === 403) throw new Error('MET Norway refused the request (403). Add a contact email or website for Yr in Settings.');
  if (res.status === 429) throw new Error('Too many requests to MET Norway right now. GlassDock will try again later.');
  if (!res.ok) throw new Error(`MET Norway answered ${res.status}.`);
  const raw = await res.json();
  return {
    key, raw, expires, lastModified: res.headers.get('last-modified') || null,
    fetchedAt: Date.now(), ...summarise(raw, timeZone),
  };
}

module.exports = { fetchForecast, summarise, userAgent, round4 };
