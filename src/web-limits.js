// Usage limits from the claude.ai and chatgpt.com websites.
//
// You sign in once in a normal GlassDock browser window. Each service has its own private,
// persistent cookie jar (an Electron "partition"). To read your limits, we open the site in
// a hidden window in that same session and ask it for the numbers its own Usage page shows.
// Your sign-in and tokens stay inside that window. Nothing is copied, stored elsewhere or
// sent anywhere but the service itself.
//
// These are the websites' internal endpoints, not public APIs, so they can change without
// notice. Every field is read defensively, and failures show up as a status, never a crash.
const { BrowserWindow, session } = require('electron');

const CLAUDE_SCRIPT = `(async () => {
  const get = async (p) => {
    const r = await fetch(p, { credentials: 'include', headers: { accept: 'application/json' } });
    const json = (r.headers.get('content-type') || '').includes('json');
    return { status: r.status, json, body: json ? await r.json() : null };
  };
  const o = await get('/api/organizations');
  if (!o.json) return { error: 'blocked', status: o.status };
  if (o.status !== 200 || !Array.isArray(o.body)) return { error: 'signed_out', status: o.status };
  const org = o.body.find((x) => (x.capabilities || []).includes('chat')) || o.body[0];
  if (!org) return { error: 'signed_out' };
  const u = await get('/api/organizations/' + org.uuid + '/usage');
  if (!u.json) return { error: 'blocked', status: u.status };
  if (u.status !== 200) return { error: 'http', status: u.status };
  return { ok: true, plan: org.rate_limit_tier || null, usage: u.body };
})()`;

const CHATGPT_SCRIPT = `(async () => {
  const s = await fetch('/api/auth/session', { credentials: 'include' });
  if (!(s.headers.get('content-type') || '').includes('json')) return { error: 'blocked', status: s.status };
  const sess = await s.json();
  if (!sess || !sess.accessToken) return { error: 'signed_out' };
  const r = await fetch('/backend-api/wham/usage', {
    credentials: 'include',
    headers: { authorization: 'Bearer ' + sess.accessToken, accept: 'application/json' },
  });
  if (!(r.headers.get('content-type') || '').includes('json')) return { error: 'blocked', status: r.status };
  if (!r.ok) return { error: r.status === 401 ? 'signed_out' : 'http', status: r.status };
  const body = await r.json();
  const plan = body.plan_type || (sess.account && (sess.account.planType || sess.account.plan_type)) || null;
  return { ok: true, plan, usage: body };
})()`;

// grok.com: per-model query allowances in a rolling window. Models it doesn't offer you are skipped.
const GROK_SCRIPT = `(async () => {
  const probes = [['grok-4', 'DEFAULT'], ['grok-4-heavy', 'DEFAULT'], ['grok-3', 'DEFAULT'], ['grok-3', 'REASONING'], ['grok-3', 'DEEPSEARCH']];
  const usage = {};
  let sawJson = false, lastStatus = 0, signedOut = false;
  for (const [modelName, requestKind] of probes) {
    let r;
    try {
      r = await fetch('/rest/rate-limits', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ requestKind, modelName }),
      });
    } catch { continue; }
    lastStatus = r.status;
    if (!(r.headers.get('content-type') || '').includes('json')) continue;
    sawJson = true;
    if (r.status === 401) { signedOut = true; break; }
    if (!r.ok) continue;
    const j = await r.json();
    const total = Number(j.totalQueries), left = Number(j.remainingQueries);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(left)) continue;
    const name = modelName + (requestKind === 'DEFAULT' ? '' : ' ' + requestKind.toLowerCase());
    usage[name] = { window: {
      used_percent: (100 * (total - left)) / total,
      limit_window_seconds: Number(j.windowSizeSeconds) || null,
      reset_after_seconds: left <= 0 && j.waitTimeSeconds ? Number(j.waitTimeSeconds) : null,
      detail: left + ' of ' + total + ' left',
    } };
  }
  if (signedOut) return { error: 'signed_out' };
  if (!sawJson) return { error: 'blocked', status: lastStatus };
  if (!Object.keys(usage).length) return { error: 'http', status: lastStatus };
  return { ok: true, plan: null, usage };
})()`;

const SERVICES = {
  claude: {
    name: 'Claude',
    partition: 'persist:glassdock-claude',
    host: 'claude.ai',
    login: 'https://claude.ai/login',
    probe: 'https://claude.ai/api/organizations',
    script: CLAUDE_SCRIPT,
  },
  chatgpt: {
    name: 'ChatGPT',
    partition: 'persist:glassdock-chatgpt',
    host: 'chatgpt.com',
    login: 'https://chatgpt.com/auth/login',
    probe: 'https://chatgpt.com/api/auth/session',
    script: CHATGPT_SCRIPT,
  },
  grok: {
    name: 'Grok',
    partition: 'persist:glassdock-grok',
    host: 'grok.com',
    login: 'https://grok.com/',
    probe: 'https://grok.com/robots.txt', // tiny same-origin page to run the request from
    script: GROK_SCRIPT,
    // grok.com also answers for signed-out visitors, so we can't tell when sign-in is
    // finished: the user closes the window themselves.
    autoClose: false,
  },
};

// A plain Chrome user agent: some sign-in pages (Google in particular) refuse anything
// that says "Electron".
function chromeUA() {
  const platform = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}

const sessions = {};
function ses(id) {
  if (!sessions[id]) {
    sessions[id] = session.fromPartition(SERVICES[id].partition);
    sessions[id].setUserAgent(chromeUA());
    sessions[id].setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  }
  return sessions[id];
}

const webPrefs = (id) => ({
  session: ses(id),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
});

function withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms)),
  ]);
}

// ---------------------------------------------------------------- normalising
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const humanize = (s) => cap(String(s).replace(/_?(rate_?limits?|window)$/i, '').replace(/[_-]+/g, ' ').trim());

function windowLabel(path, secs) {
  const last = path[path.length - 1] || '';
  let base;
  if (/five_hour/i.test(last)) base = '5-hour';
  else if (/seven_day/i.test(last)) {
    const extra = last.replace(/^seven_day_?/i, '');
    base = extra ? `Weekly · ${humanize(extra)}` : 'Weekly';
  } else if (secs) {
    base = secs >= 6 * 86400 ? 'Weekly' : secs >= 86400 ? `${Math.round(secs / 86400)}-day` : `${Math.round(secs / 3600)}-hour`;
  } else base = humanize(last) || 'Limit';
  const prefix = path.slice(0, -1).map(humanize).filter(Boolean).join(' ');
  return prefix ? `${prefix} · ${base}` : base;
}

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'string') return Date.parse(v) || null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  return null;
}

// Walk the response and collect every object that looks like a usage window.
function collectWindows(obj, path = [], out = [], depth = 0) {
  if (depth > 5) return out;
  if (obj === null && /^(five_hour|seven_day)$/.test(path[path.length - 1] || '')) {
    // claude.ai sends null for a window you haven't used yet
    out.push({ path, pct: 0, resetsAt: null, secs: /five/.test(path[path.length - 1]) ? 18000 : 604800 });
    return out;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  const pct = obj.utilization ?? obj.used_percent ?? obj.usedPercent;
  if (typeof pct === 'number') {
    const now = Date.now();
    let resetsAt = toMs(obj.resets_at ?? obj.reset_at ?? obj.resetsAt);
    const after = obj.reset_after_seconds ?? obj.resets_in_seconds;
    if (!resetsAt && typeof after === 'number') resetsAt = now + after * 1000;
    let secs = obj.limit_window_seconds ?? (obj.window_minutes != null ? obj.window_minutes * 60 : null);
    const key = path[path.length - 1] || '';
    if (!secs && /five_hour/i.test(key)) secs = 18000;
    if (!secs && /seven_day/i.test(key)) secs = 604800;
    const expired = resetsAt && resetsAt < now;
    out.push({ path, pct: expired ? 0 : Math.max(0, Math.min(100, pct)), resetsAt: expired ? null : resetsAt, secs, detail: typeof obj.detail === 'string' ? obj.detail : null });
    return out;
  }
  for (const [k, v] of Object.entries(obj)) collectWindows(v, [...path, k], out, depth + 1);
  return out;
}

function prettyPlan(plan) {
  if (!plan) return null;
  return String(plan).replace(/^default_/, '').replace(/^claude_/, '').replace(/_/g, ' ')
    .replace(/\b(\w)/g, (c) => c.toUpperCase()).replace(/(\d+)X\b/, '$1x');
}

function normalise(id, result) {
  if (!result || !result.ok) {
    return { status: (result && result.error) || 'error', httpStatus: result && result.status, windows: [] };
  }
  const windows = collectWindows(result.usage).map((w) => ({
    label: windowLabel(w.path, w.secs), pct: w.pct, resetsAt: w.resetsAt, secs: w.secs, detail: w.detail || null,
  }));
  // The dock shows the shortest window (normally the 5-hour one).
  const primary = [...windows].sort((a, b) => (a.secs || 1e12) - (b.secs || 1e12))[0] || null;
  return { status: 'ok', plan: prettyPlan(result.plan), windows, primary };
}

// ---------------------------------------------------------------- fetching
async function fetchLimits(id) {
  const svc = SERVICES[id];
  const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { ...webPrefs(id), backgroundThrottling: false } });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await withTimeout(win.loadURL(svc.probe).catch(() => {}), 25000, 'Loading');
    const result = await withTimeout(win.webContents.executeJavaScript(svc.script, true), 25000, 'Request');
    return { ...normalise(id, result), at: Date.now() };
  } catch (e) {
    return { status: 'error', error: String(e.message || e), windows: [], at: Date.now() };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

// Opens a visible window to sign in (or pass a security check). Resolves when the
// session works, or when the user closes the window.
function openSignIn(id, url) {
  const svc = SERVICES[id];
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480, height: 760,
      title: svc.autoClose === false ? `Sign in to ${svc.name}, then close this window — GlassDock` : `Sign in to ${svc.name} — GlassDock`,
      autoHideMenuBar: true, webPreferences: webPrefs(id),
    });
    win.webContents.setWindowOpenHandler(() => ({
      action: 'allow', // sign-in popups (e.g. "Continue with Google")
      overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: webPrefs(id) },
    }));
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.close();
      resolve(ok);
    };
    const check = () => {
      if (svc.autoClose === false) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (win.isDestroyed()) return;
        let host = '';
        try { host = new URL(win.webContents.getURL()).hostname; } catch {}
        if (!host.endsWith(svc.host)) return;
        try {
          const r = await win.webContents.executeJavaScript(svc.script, true);
          if (r && r.ok) setTimeout(() => finish(true), 800);
        } catch {}
      }, 1200);
    };
    win.webContents.on('did-finish-load', check);
    win.webContents.on('did-navigate-in-page', check);
    win.on('closed', () => finish(false));
    win.loadURL(url || svc.login);
  });
}

async function signOut(id) {
  await ses(id).clearStorageData();
}

module.exports = { SERVICES, fetchLimits, openSignIn, signOut, _normalise: normalise };
