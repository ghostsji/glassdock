// Which pinned apps are running, and switching to their windows (Windows only).
//
// We list top-level windows the same way the taskbar does (visible, not owned, not tool
// windows, not cloaked on another virtual desktop), find the program behind each one, and
// match those against the pinned apps.
const koffi = require('koffi');
const path = require('path');
const fs = require('fs');
const { shell } = require('electron');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const EnumWindowsProc = koffi.proto('bool __stdcall GD_EnumWindowsProc(intptr_t hwnd, intptr_t lParam)');
const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr_t']);
const EnumChildWindows = user32.func('__stdcall', 'EnumChildWindows', 'bool', ['intptr_t', koffi.pointer(EnumWindowsProc), 'intptr_t']);
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'bool', ['intptr_t']);
const IsIconic = user32.func('__stdcall', 'IsIconic', 'bool', ['intptr_t']);
const GetWindow = user32.func('__stdcall', 'GetWindow', 'intptr_t', ['intptr_t', 'uint32']);
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['intptr_t', 'int32']);
const GetWindowTextLengthW = user32.func('__stdcall', 'GetWindowTextLengthW', 'int32', ['intptr_t']);
const GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int32', ['intptr_t', 'void *', 'int32']);
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['intptr_t', koffi.out(koffi.pointer('uint32'))]);
const GetClassNameW = user32.func('__stdcall', 'GetClassNameW', 'int32', ['intptr_t', 'void *', 'int32']);
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'intptr_t', []);
const SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', 'bool', ['intptr_t']);
const SwitchToThisWindow = user32.func('__stdcall', 'SwitchToThisWindow', 'void', ['intptr_t', 'bool']);
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'bool', ['intptr_t', 'int']);
const PostMessageW = user32.func('__stdcall', 'PostMessageW', 'bool', ['intptr_t', 'uint32', 'uintptr_t', 'intptr_t']);
const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'intptr_t', ['uint32', 'bool', 'uint32']);
const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'bool', ['intptr_t']);
const QueryFullProcessImageNameW = kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'bool',
  ['intptr_t', 'uint32', 'void *', koffi.inout(koffi.pointer('uint32'))]);
let GetApplicationUserModelId = null; // Windows 8+
try {
  GetApplicationUserModelId = kernel32.func('__stdcall', 'GetApplicationUserModelId', 'int32',
    ['intptr_t', koffi.inout(koffi.pointer('uint32')), 'void *']);
} catch {}
const DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32', ['intptr_t', 'uint32', 'void *', 'uint32']);

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);
const GW_OWNER = 4;
const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80;
const WS_EX_APPWINDOW = 0x40000;
const WS_EX_NOACTIVATE = 0x08000000;
const SW_MINIMIZE = 6;
const SW_RESTORE = 9;
const WM_CLOSE = 0x10;

// One registered callback, reused for every enumeration.
let collected = [];
const enumCb = koffi.register((hwnd) => { collected.push(num(hwnd)); return true; }, koffi.pointer(EnumWindowsProc));

function listHandles(parent) {
  collected = [];
  if (parent) EnumChildWindows(parent, enumCb, 0); else EnumWindows(enumCb, 0);
  return collected;
}

function pidOf(hwnd) {
  const out = [0];
  GetWindowThreadProcessId(hwnd, out);
  return out[0];
}

const procCache = new Map(); // pid -> { exe, aumid, at }
function processInfo(pid) {
  const hit = procCache.get(pid);
  if (hit && Date.now() - hit.at < 60000) return hit;
  let exe = '';
  let aumid = '';
  const h = num(OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid));
  if (h) {
    try {
      const buf = Buffer.alloc(2048);
      const size = [1024];
      if (QueryFullProcessImageNameW(h, 0, buf, size)) exe = buf.toString('utf16le', 0, size[0] * 2);
      if (GetApplicationUserModelId) {
        const abuf = Buffer.alloc(1024);
        const alen = [512];
        if (GetApplicationUserModelId(h, alen, abuf) === 0) aumid = abuf.toString('utf16le').replace(/\0[\s\S]*$/, '');
      }
    } finally {
      CloseHandle(h);
    }
  }
  const info = { exe, aumid, at: Date.now() };
  procCache.set(pid, info);
  return info;
}

function isCloaked(hwnd) {
  const b = Buffer.alloc(4);
  return DwmGetWindowAttribute(hwnd, 14 /* DWMWA_CLOAKED */, b, 4) === 0 && b.readUInt32LE(0) !== 0;
}

function classOf(hwnd) {
  const buf = Buffer.alloc(512);
  const n = GetClassNameW(hwnd, buf, 256);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}
// Shell windows that are technically visible app windows but never on the taskbar.
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow']);

function titleOf(hwnd) {
  const len = GetWindowTextLengthW(hwnd);
  if (len <= 0) return '';
  const buf = Buffer.alloc((len + 1) * 2);
  GetWindowTextW(hwnd, buf, len + 1);
  return buf.toString('utf16le').replace(/\0[\s\S]*$/, '');
}

// Taskbar-style list of app windows, topmost first.
function appWindows() {
  const out = [];
  for (const hwnd of listHandles(0)) {
    if (!IsWindowVisible(hwnd) || num(GetWindow(hwnd, GW_OWNER))) continue;
    const ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
    const appWin = ex & WS_EX_APPWINDOW;
    if (((ex & WS_EX_TOOLWINDOW) || (ex & WS_EX_NOACTIVATE)) && !appWin) continue;
    if (isCloaked(hwnd)) continue;
    const title = titleOf(hwnd);
    if (!title || SHELL_CLASSES.has(classOf(hwnd))) continue;
    const pid = pidOf(hwnd);
    if (pid === process.pid) continue; // our own windows
    let appPid = pid; // the app's own process (differs for Store apps, see below)
    let { exe, aumid } = processInfo(pid);
    // Store apps live inside ApplicationFrameHost; the real app is a child window's process.
    if (/\\applicationframehost\.exe$/i.test(exe)) {
      for (const child of listHandles(hwnd)) {
        const cpid = pidOf(child);
        if (cpid && cpid !== pid) { ({ exe, aumid } = processInfo(cpid)); appPid = cpid; break; }
      }
    }
    out.push({ hwnd, pid: appPid, exe: exe.toLowerCase(), exePath: exe, aumid, title });
  }
  return out;
}

// ---------------------------------------------------------------- matching pinned apps
const norm = (s) => String(s || '').toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
const matcherCache = new Map(); // entry id -> matcher

function matcherFor(entry) {
  const key = `${entry.id}|${entry.path || ''}|${entry.aumid || ''}`;
  const hit = matcherCache.get(entry.id);
  if (hit && hit.key === key) return hit;
  const m = { key, exes: new Set(), names: new Set(), dirs: [], aumids: new Set(), folder: null };
  if (entry.aumid) m.aumids.add(entry.aumid);
  const addExe = (p) => {
    if (!p || !/\.exe$/i.test(p)) return;
    m.exes.add(p.toLowerCase());
    m.names.add(norm(path.basename(p)));
    // Squirrel-style launchers (Discord, Slack, Teams…) start the real exe from a subfolder.
    if (/^(update|.*launcher)\.exe$/i.test(path.basename(p))) m.dirs.push(path.dirname(p).toLowerCase() + path.sep);
  };
  if (entry.path) {
    if (/\.lnk$/i.test(entry.path)) {
      try {
        const link = shell.readShortcutLink(entry.path);
        addExe(link.target);
        if (link.appUserModelId) m.aumids.add(link.appUserModelId);
      } catch {}
      m.names.add(norm(entry.name));
    } else if (/\.exe$/i.test(entry.path)) {
      addExe(entry.path);
    } else {
      try { if (fs.statSync(entry.path).isDirectory()) m.folder = path.basename(entry.path).toLowerCase(); } catch {}
    }
  }
  matcherCache.set(entry.id, m);
  return m;
}

function matches(m, w) {
  if (w.aumid && m.aumids.has(w.aumid)) return true;
  if (!w.exe) return false;
  if (m.exes.has(w.exe)) return true;
  if (m.dirs.some((d) => w.exe.startsWith(d))) return true;
  if (m.folder) return /\\explorer\.exe$/.test(w.exe) && w.title.toLowerCase() === m.folder;
  return m.names.has(norm(path.basename(w.exe)));
}

// -> { result: { [entryId]: [window, ...] }, others: [group, ...], foreground }
// `others` (only when asked) groups every remaining app window by program.
function runningFor(entries, includeOthers = false) {
  const wins = appWindows();
  const result = {};
  const claimed = new Set();
  for (const e of entries) {
    const m = matcherFor(e);
    const list = wins.filter((w) => matches(m, w));
    if (list.length) { result[e.id] = list; list.forEach((w) => claimed.add(w.hwnd)); }
  }
  const others = [];
  if (includeOthers) {
    const groups = new Map();
    for (const w of wins) {
      if (claimed.has(w.hwnd) || (!w.exe && !w.aumid)) continue;
      const key = w.aumid ? `app:${w.aumid}` : `exe:${w.exe}`;
      if (!groups.has(key)) groups.set(key, { key, exePath: w.exePath, aumid: w.aumid, wins: [] });
      groups.get(key).wins.push(w);
    }
    others.push(...groups.values());
  }
  return { result, others, foreground: num(GetForegroundWindow()) };
}

// ---------------------------------------------------------------- acting on windows
function focusWindow(hwnd) {
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
  SetForegroundWindow(hwnd);
  // Windows only lets the foreground app hand over focus; the dock never takes focus,
  // so fall back to SwitchToThisWindow, which isn't subject to that rule.
  if (num(GetForegroundWindow()) !== hwnd) SwitchToThisWindow(hwnd, true);
}

// Taskbar behaviour: bring it forward; if it's already in front, go to its next window,
// or minimize it when it has only one.
function activate(windows) {
  if (!windows || !windows.length) return;
  const fg = num(GetForegroundWindow());
  const i = windows.findIndex((w) => w.hwnd === fg);
  if (i === -1) focusWindow(windows[0].hwnd);
  else if (windows.length > 1) focusWindow(windows[(i + 1) % windows.length].hwnd);
  else ShowWindow(fg, SW_MINIMIZE);
}

function minimizeWindows(windows) {
  for (const w of windows || []) ShowWindow(w.hwnd, SW_MINIMIZE);
}

function restoreWindows(windows) {
  // bottom-most first, so the top window ends up in front
  for (const w of [...(windows || [])].reverse()) if (IsIconic(w.hwnd)) ShowWindow(w.hwnd, SW_RESTORE);
  if (windows && windows[0]) focusWindow(windows[0].hwnd);
}

function closeWindows(windows) {
  for (const w of windows || []) PostMessageW(w.hwnd, WM_CLOSE, 0, 0);
}

function forget(id) { matcherCache.delete(id); }

module.exports = { runningFor, activate, focusWindow, minimizeWindows, restoreWindows, closeWindows, forget, _test: { matcherFor, matches } };
