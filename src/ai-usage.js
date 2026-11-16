// AI usage, read from local log files only. Nothing is sent anywhere.
//
//  - Claude Code writes every response's token usage to ~/.claude/projects/**/*.jsonl.
//    We total it per 5-hour usage window (same idea as the popular `ccusage` tool).
//    Anthropic doesn't publish exact plan limits, so this is usage, not "% of limit",
//    unless you set your own budget.
//  - Codex CLI writes the rate-limit snapshot it gets from OpenAI (5-hour and weekly
//    "% used") into ~/.codex/sessions/**/*.jsonl. We show the latest snapshot.
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const WINDOW = 5 * HOUR;
const KEEP = 8 * DAY;

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

function listJsonl(dir, since, out = [], depth = 0) {
  if (depth > 5) return out;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJsonl(p, since, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) {
      try {
        const st = fs.statSync(p);
        if (st.mtimeMs >= since) out.push({ p, size: st.size, mtime: st.mtimeMs });
      } catch {}
    }
  }
  return out;
}

// ---------------------------------------------------------------- Claude Code
function claudeRoots() {
  const roots = [];
  if (process.env.CLAUDE_CONFIG_DIR) {
    for (const p of process.env.CLAUDE_CONFIG_DIR.split(path.delimiter)) if (p) roots.push(path.join(p, 'projects'));
  }
  roots.push(path.join(os.homedir(), '.claude', 'projects'));
  roots.push(path.join(os.homedir(), '.config', 'claude', 'projects'));
  return [...new Set(roots)].filter(exists);
}

// Per-file cache so we only parse the bytes appended since the last scan.
const fileCache = new Map(); // path -> { offset, entries: Map(key -> entry) }

function readNewLines(p, size) {
  let c = fileCache.get(p);
  if (!c || size < c.offset) { c = { offset: 0, entries: new Map() }; fileCache.set(p, c); }
  if (size === c.offset) return c;
  const fd = fs.openSync(p, 'r');
  try {
    const len = size - c.offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, c.offset);
    const lastNl = buf.lastIndexOf(10);
    if (lastNl < 0) return c; // wait for a complete line
    c.offset += lastNl + 1;
    const cutoff = Date.now() - KEEP;
    for (const line of buf.toString('utf8', 0, lastNl).split('\n')) {
      if (!line.includes('"usage"')) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      const msg = j.message;
      const u = msg && msg.usage;
      if (!u || !j.timestamp) continue;
      const t = Date.parse(j.timestamp);
      if (!t || t < cutoff) continue;
      const model = msg.model || 'unknown';
      if (model === '<synthetic>') continue;
      const key = msg.id ? `${msg.id}:${j.requestId || ''}` : (j.uuid || `${p}:${t}`);
      c.entries.set(key, {
        t, model,
        input: u.input_tokens || 0,
        output: u.output_tokens || 0,
        cacheWrite: u.cache_creation_input_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
      });
    }
  } finally {
    fs.closeSync(fd);
  }
  return c;
}

function sum(entries) {
  const s = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, messages: entries.length };
  for (const e of entries) {
    s.input += e.input; s.output += e.output; s.cacheWrite += e.cacheWrite; s.cacheRead += e.cacheRead;
  }
  s.total = s.input + s.output + s.cacheWrite; // cache reads are cheap and huge, so shown separately
  return s;
}

function friendlyModel(id) {
  const m = /claude-(?:(opus|sonnet|haiku|fable|mythos)-)?([\d-]+)?-?(opus|sonnet|haiku|fable|mythos)?/i.exec(id || '');
  if (!m) return id;
  const family = (m[1] || m[3] || '').replace(/^./, (c) => c.toUpperCase());
  const ver = (m[2] || '').replace(/-\d{8}$/, '').replace(/-/g, '.').replace(/^\.|\.$/g, '');
  return family ? `${family} ${ver}`.trim() : id;
}

function claudeUsage() {
  const roots = claudeRoots();
  if (!roots.length) return { found: false };
  const now = Date.now();
  const since = now - KEEP;

  const all = new Map(); // dedupe: resumed sessions copy old messages into new files
  for (const root of roots) {
    for (const f of listJsonl(root, since)) {
      try {
        const c = readNewLines(f.p, f.size);
        for (const [k, e] of c.entries) {
          if (e.t < since) c.entries.delete(k);
          else all.set(k, e);
        }
      } catch {}
    }
  }
  const list = [...all.values()].sort((a, b) => a.t - b.t);

  // 5-hour windows: a window starts (rounded down to the hour) at the first message
  // after the previous window ended.
  let start = null;
  let block = [];
  for (const e of list) {
    if (start === null || e.t >= start + WINDOW) {
      start = Math.floor(e.t / HOUR) * HOUR;
      block = [];
    }
    block.push(e);
  }
  const active = start !== null && now < start + WINDOW;

  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const week = list.filter((e) => e.t >= now - 7 * DAY);
  const byModel = {};
  for (const e of week) {
    const name = friendlyModel(e.model);
    byModel[name] = (byModel[name] || 0) + e.input + e.output + e.cacheWrite;
  }

  return {
    found: true,
    active,
    windowStart: active ? start : null,
    resetsAt: active ? start + WINDOW : null,
    window: active ? sum(block) : null,
    today: sum(list.filter((e) => e.t >= midnight.getTime())),
    week: sum(week),
    byModel: Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 4),
    lastActivity: list.length ? list[list.length - 1].t : null,
  };
}

// ---------------------------------------------------------------- Codex CLI
function normWindow(w, at) {
  if (!w || typeof w !== 'object') return null;
  const pct = Number(w.used_percent ?? w.usedPercent);
  if (!Number.isFinite(pct)) return null;
  let resetsAt = null;
  const ra = w.resets_at ?? w.resetsAt;
  const rin = w.resets_in_seconds ?? w.resetsInSeconds;
  if (ra != null) resetsAt = typeof ra === 'string' ? Date.parse(ra) : (ra > 1e12 ? ra : ra * 1000);
  else if (rin != null) resetsAt = at + rin * 1000;
  const windowMinutes = w.window_minutes ?? w.windowMinutes ?? null;
  // If the window has already reset since the snapshot, usage is back to 0.
  if (resetsAt && Date.now() > resetsAt) return { pct: 0, resetsAt: null, windowMinutes, reset: true };
  return { pct: Math.max(0, Math.min(100, pct)), resetsAt, windowMinutes };
}

function lastRateLimits(f) {
  const len = Math.min(f.size, 1024 * 1024);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(f.p, 'r');
  try { fs.readSync(fd, buf, 0, len, f.size - len); } finally { fs.closeSync(fd); }
  const lines = buf.toString('utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('rate_limits')) continue;
    let j;
    try { j = JSON.parse(lines[i]); } catch { continue; }
    const rl = j.payload?.rate_limits ?? j.payload?.info?.rate_limits ?? j.rate_limits ?? j.msg?.rate_limits;
    if (!rl) continue;
    const at = Date.parse(j.timestamp) || f.mtime;
    const primary = normWindow(rl.primary, at);
    const secondary = normWindow(rl.secondary, at);
    if (primary || secondary) return { at, primary, secondary };
  }
  return null;
}

function codexUsage() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const dir = path.join(home, 'sessions');
  if (!exists(dir)) return { found: false };
  const files = listJsonl(dir, Date.now() - KEEP).sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  for (const f of files) {
    try {
      const snap = lastRateLimits(f);
      if (snap) return { found: true, ...snap };
    } catch {}
  }
  return { found: true, empty: true };
}

// ---------------------------------------------------------------- Gemini CLI
// Gemini CLI saves each chat to ~/.gemini/tmp/<project>/chats/session-*.json, with token counts
// on every model reply. Older versions only keep ~/.gemini/tmp/<project>/logs.json (your prompts,
// no token counts). Its free-tier quota is a daily request count that resets at midnight Pacific
// time, so "today" here means today in Pacific time.
const PT = 'America/Los_Angeles';

function ptMidnight(ts) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: PT, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = wallAsUtc - Math.floor(ts / 1000) * 1000; // Pacific offset from UTC
  return Date.UTC(+p.year, +p.month - 1, +p.day) - offset;
}

const geminiCache = new Map(); // path -> { mtime, size, items }

function parseGeminiFile(p, kind) {
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const items = [];
  if (kind === 'chat') {
    const sid = data.sessionId || p;
    for (const m of Array.isArray(data.messages) ? data.messages : []) {
      if (!m || !['gemini', 'model', 'assistant'].includes(m.type)) continue;
      const t = Date.parse(m.timestamp);
      if (!t) continue;
      const tk = m.tokens || {};
      const input = Number(tk.input ?? tk.prompt) || 0;
      const output = Number(tk.output ?? tk.candidates) || 0;
      const cached = Number(tk.cached) || 0;
      const thoughts = Number(tk.thoughts) || 0;
      const total = Number(tk.total) || input + output + thoughts + (Number(tk.tool) || 0);
      items.push({ key: `${sid}:${m.id ?? t}`, t, kind: 'reply', model: m.model || 'gemini', input, output, cached, thoughts, total });
    }
  } else {
    for (const m of Array.isArray(data) ? data : []) {
      if (!m || m.type !== 'user') continue;
      const t = Date.parse(m.timestamp);
      if (t) items.push({ key: `${m.sessionId}:${m.messageId ?? t}`, t, kind: 'prompt' });
    }
  }
  return items;
}

function geminiUsage() {
  const root = path.join(process.env.GEMINI_CLI_HOME || os.homedir(), '.gemini', 'tmp');
  if (!exists(root)) return { found: false };
  const now = Date.now();
  const since = now - KEEP;

  const files = [];
  let projects = [];
  try { projects = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch {}
  for (const d of projects) {
    const dir = path.join(root, d.name);
    const chats = path.join(dir, 'chats');
    let names = [];
    try { names = fs.readdirSync(chats); } catch {}
    for (const n of names) if (n.endsWith('.json')) files.push({ p: path.join(chats, n), kind: 'chat' });
    files.push({ p: path.join(dir, 'logs.json'), kind: 'log' });
  }

  const replies = new Map();
  const prompts = new Map();
  for (const f of files) {
    let st;
    try { st = fs.statSync(f.p); } catch { continue; }
    if (st.mtimeMs < since) continue;
    let c = geminiCache.get(f.p);
    if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) {
      try { c = { mtime: st.mtimeMs, size: st.size, items: parseGeminiFile(f.p, f.kind) }; } catch { continue; } // mid-write: try next time
      geminiCache.set(f.p, c);
    }
    for (const it of c.items) {
      if (it.t < since) continue;
      (it.kind === 'reply' ? replies : prompts).set(it.key, it);
    }
  }
  if (!replies.size && !prompts.size) return { found: true, empty: true };

  const dayStart = ptMidnight(now);
  const resetsAt = ptMidnight(dayStart + 36 * HOUR); // next Pacific midnight (DST-safe)
  const r = [...replies.values()];
  const tally = (list) => list.reduce((s, e) => {
    s.requests += 1; s.tokens += e.total; s.input += e.input; s.output += e.output; s.cached += e.cached; s.thoughts += e.thoughts;
    return s;
  }, { requests: 0, tokens: 0, input: 0, output: 0, cached: 0, thoughts: 0 });

  const week = r.filter((e) => e.t >= now - 7 * DAY);
  const byModel = {};
  for (const e of week) byModel[e.model] = (byModel[e.model] || 0) + 1;
  const all = [...r, ...prompts.values()];

  return {
    found: true,
    source: r.length ? 'chats' : 'logs', // 'logs' = old Gemini CLI: prompts only, no tokens
    today: tally(r.filter((e) => e.t >= dayStart)),
    promptsToday: [...prompts.values()].filter((e) => e.t >= dayStart).length,
    week: tally(week),
    byModel: Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 4),
    resetsAt,
    lastActivity: all.length ? Math.max(...all.map((e) => e.t)) : null,
  };
}

function aiUsage() {
  let claude = { found: false };
  let codex = { found: false };
  try { claude = claudeUsage(); } catch (e) { claude = { found: false, error: String(e.message || e) }; }
  try { codex = codexUsage(); } catch (e) { codex = { found: false, error: String(e.message || e) }; }
  let gemini = { found: false };
  try { gemini = geminiUsage(); } catch (e) { gemini = { found: false, error: String(e.message || e) }; }
  return { claude, codex, gemini, scannedAt: Date.now() };
}

module.exports = { aiUsage };
