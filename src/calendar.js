// Calendar events from iCal (.ics) subscription links.
//
// Google Calendar, Outlook.com / Microsoft 365 and iCloud can all give you a private link to
// your calendar in iCal format. We download it, expand repeating events (with their exceptions
// and time zones) into individual occurrences for the next few weeks, and hand those to the UI.
const ICAL = require('ical.js');

const DAY = 864e5;
const PAST = 1 * DAY;    // keep yesterday, so "today" is always complete
const AHEAD = 62 * DAY;  // about two months ahead
const MAX_BYTES = 20 * 1024 * 1024;

const COLORS = ['#5B8DEF', '#E8875B', '#34C778', '#B07CF0', '#F2C94C', '#EF5B7B', '#3FC1C9', '#9AA5B1'];

function normaliseUrl(input) {
  let u = String(input || '').trim();
  if (/^webcals?:\/\//i.test(u)) u = u.replace(/^webcal(s?):\/\//i, 'https://');
  let parsed;
  try { parsed = new URL(u); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  return parsed.toString();
}

// Meeting links people actually click: Google Meet, Teams, Zoom, Webex, Whereby, Around…
const MEETING = /https:\/\/(?:meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|[\w-]+\.zoom\.us|zoom\.us|[\w-]+\.webex\.com|whereby\.com|meet\.around\.co)\/[^\s<>"')\]]+/i;
function meetingLink(...texts) {
  for (const t of texts) {
    const m = MEETING.exec(String(t || ''));
    if (m) return m[0].replace(/[.,;]+$/, '');
  }
  return null;
}

function registerTimezones(root) {
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      try {
        ICAL.TimezoneService.register(tz.getFirstPropertyValue('tzid'), new ICAL.Timezone(tz));
      } catch {}
    }
  }
}

function occurrence(ev, start, end, calId) {
  const allDay = start.isDate;
  const s = start.toJSDate().getTime();
  let e = end ? end.toJSDate().getTime() : s + (allDay ? DAY : 0);
  if (e < s) e = s;
  return {
    calId,
    uid: ev.uid,
    key: `${calId}|${ev.uid}|${s}`,
    title: ev.summary || '(No title)',
    location: ev.location || '',
    start: s,
    end: e,
    allDay,
    link: meetingLink(ev.location, ev.description, ev.component.getFirstPropertyValue('url'),
      ev.component.getFirstPropertyValue('x-google-conference')),
  };
}

// -> { name, events: [...] } for occurrences overlapping [from, to]
function parseIcs(text, calId, now = Date.now()) {
  const root = new ICAL.Component(ICAL.parse(text));
  registerTimezones(root);
  const from = now - PAST;
  const to = now + AHEAD;
  const vevents = root.getAllSubcomponents('vevent');

  // Changed or moved single occurrences of a repeating event come as separate VEVENTs
  // with a RECURRENCE-ID; attach them to their series.
  const exceptions = new Map();
  for (const v of vevents) {
    if (!v.hasProperty('recurrence-id')) continue;
    const uid = v.getFirstPropertyValue('uid');
    if (!exceptions.has(uid)) exceptions.set(uid, []);
    exceptions.get(uid).push(v);
  }

  const out = [];
  for (const v of vevents) {
    if (v.hasProperty('recurrence-id')) continue;
    if (String(v.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') continue;
    let ev;
    try { ev = new ICAL.Event(v); } catch { continue; }
    for (const ex of exceptions.get(ev.uid) || []) { try { ev.relateException(ex); } catch {} }

    if (!ev.isRecurring()) {
      if (!ev.startDate) continue;
      const o = occurrence(ev, ev.startDate, ev.endDate, calId);
      if (o.end >= from && o.start <= to) out.push(o);
      continue;
    }
    // Walk the series from its first date (that's the only correct way with rules like
    // "every 2nd Tuesday"); old daily series are cheap enough to skip through.
    const it = ev.iterator();
    let next;
    let guard = 0;
    while ((next = it.next()) && guard++ < 60000) {
      const t = next.toJSDate().getTime();
      if (t > to) break;
      let details;
      try { details = ev.getOccurrenceDetails(next); } catch { continue; }
      const item = details.item; // the exception's own data, if this occurrence was changed
      if (String(item.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') continue;
      const o = occurrence(item, details.startDate, details.endDate, calId);
      if (o.end >= from) out.push(o);
    }
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return { name: root.getFirstPropertyValue('x-wr-calname') || null, events: out };
}

// fetchText(url) -> Promise<string>, supplied by the caller (Electron's net.fetch)
async function loadCalendar(cal, fetchText) {
  const text = await fetchText(cal.url);
  if (text.length > MAX_BYTES) throw new Error('This calendar is too large (over 20 MB).');
  if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000))) {
    throw new Error("That link didn't return a calendar. Use the iCal / .ics link (see the help below).");
  }
  return parseIcs(text, cal.id);
}

module.exports = { COLORS, normaliseUrl, parseIcs, loadCalendar, meetingLink };
