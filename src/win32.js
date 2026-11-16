// Thin Win32 bindings (via koffi, no compiler needed) for:
//  - registering the dock as an "AppBar" so maximized windows don't cover it
//  - hiding / restoring the Windows taskbar
//  - rounded window corners on Windows 11
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const shell32 = koffi.load('shell32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const RECT = koffi.struct('GD_RECT', {
  left: 'int32', top: 'int32', right: 'int32', bottom: 'int32',
});
const APPBARDATA = koffi.struct('GD_APPBARDATA', {
  cbSize: 'uint32',
  hWnd: 'intptr_t',
  uCallbackMessage: 'uint32',
  uEdge: 'uint32',
  rc: RECT,
  lParam: 'intptr_t',
});

const SHAppBarMessage = shell32.func('__stdcall', 'SHAppBarMessage', 'uintptr_t',
  ['uint32', koffi.inout(koffi.pointer(APPBARDATA))]);
const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'intptr_t', ['str16', 'str16']);
const FindWindowExW = user32.func('__stdcall', 'FindWindowExW', 'intptr_t',
  ['intptr_t', 'intptr_t', 'str16', 'str16']);
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'bool', ['intptr_t', 'int']);
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'bool', ['intptr_t']);
const keybd_event = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr_t']);
const DwmSetWindowAttribute = dwmapi.func('__stdcall', 'DwmSetWindowAttribute', 'int32',
  ['intptr_t', 'uint32', 'void *', 'uint32']);

const ABM = { NEW: 0, REMOVE: 1, QUERYPOS: 2, SETPOS: 3, GETSTATE: 4, SETSTATE: 10 };
const ABE = { left: 0, top: 1, right: 2, bottom: 3 };
const ABS_AUTOHIDE = 1;
const SW_HIDE = 0;
const SW_SHOWNA = 8;

const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

function hwndFromBuffer(buf) {
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

function makeAbd(hwnd) {
  return {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: hwnd,
    uCallbackMessage: 0,
    uEdge: 0,
    rc: { left: 0, top: 0, right: 0, bottom: 0 },
    lParam: 0,
  };
}

let registeredHwnd = null;

function appBarRegister(hwnd, callbackMessage) {
  if (registeredHwnd === hwnd) return;
  const abd = makeAbd(hwnd);
  abd.uCallbackMessage = callbackMessage;
  SHAppBarMessage(ABM.NEW, abd);
  registeredHwnd = hwnd;
}

// monitorRect and thickness are in physical pixels. Returns the granted rect.
function appBarSetPos(hwnd, edge, monitorRect, thickness) {
  const abd = makeAbd(hwnd);
  abd.uEdge = ABE[edge] ?? ABE.bottom;
  abd.rc = { ...monitorRect };
  const fit = () => {
    if (edge === 'top') abd.rc.bottom = abd.rc.top + thickness;
    else if (edge === 'left') abd.rc.right = abd.rc.left + thickness;
    else if (edge === 'right') abd.rc.left = abd.rc.right - thickness;
    else abd.rc.top = abd.rc.bottom - thickness;
  };
  fit();
  SHAppBarMessage(ABM.QUERYPOS, abd);
  fit();
  SHAppBarMessage(ABM.SETPOS, abd);
  return { ...abd.rc };
}

function appBarRemove() {
  if (registeredHwnd == null) return;
  SHAppBarMessage(ABM.REMOVE, makeAbd(registeredHwnd));
  registeredHwnd = null;
}

function taskbarWindows() {
  const list = [];
  const main = num(FindWindowW('Shell_TrayWnd', null));
  if (main) list.push(main);
  let h = 0;
  for (let i = 0; i < 16; i++) {
    h = num(FindWindowExW(0, h, 'Shell_SecondaryTrayWnd', null));
    if (!h) break;
    list.push(h);
  }
  return list;
}

function getTaskbarState() {
  const abd = makeAbd(num(FindWindowW('Shell_TrayWnd', null)) || 0);
  return num(SHAppBarMessage(ABM.GETSTATE, abd));
}

function setTaskbarState(state) {
  const abd = makeAbd(num(FindWindowW('Shell_TrayWnd', null)) || 0);
  abd.lParam = state;
  SHAppBarMessage(ABM.SETSTATE, abd);
}

function hideTaskbars() {
  for (const h of taskbarWindows()) if (IsWindowVisible(h)) ShowWindow(h, SW_HIDE);
}

function showTaskbars() {
  for (const h of taskbarWindows()) ShowWindow(h, SW_SHOWNA);
}

// Windows 11 only; silently ignored on Windows 10.
function setRoundedCorners(hwnd, round) {
  const pref = Buffer.alloc(4);
  pref.writeInt32LE(round ? 2 /* DWMWCP_ROUND */ : 1 /* DWMWCP_DONOTROUND */);
  try { DwmSetWindowAttribute(hwnd, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, pref, 4); } catch {}
}

// Opens Start exactly as pressing the Windows key does.
function openStartMenu() {
  keybd_event(0x5B /* VK_LWIN */, 0, 0, 0);
  keybd_event(0x5B, 0, 2 /* KEYEVENTF_KEYUP */, 0);
}

// Win+D: show the desktop (press again to bring the windows back).
function showDesktop() {
  keybd_event(0x5B, 0, 0, 0);
  keybd_event(0x44 /* D */, 0, 0, 0);
  keybd_event(0x44, 0, 2, 0);
  keybd_event(0x5B, 0, 2, 0);
}

// Win + a letter, e.g. Win+K (Cast) or Win+P (Project).
function winShortcut(letter) {
  const vk = String(letter).toUpperCase().charCodeAt(0);
  if (vk < 0x41 || vk > 0x5A) return;
  keybd_event(0x5B, 0, 0, 0);
  keybd_event(vk, 0, 0, 0);
  keybd_event(vk, 0, 2, 0);
  keybd_event(0x5B, 0, 2, 0);
}

module.exports = {
  openStartMenu,
  showDesktop,
  winShortcut,
  ABS_AUTOHIDE,
  hwndFromBuffer,
  appBarRegister,
  appBarSetPos,
  appBarRemove,
  getTaskbarState,
  setTaskbarState,
  hideTaskbars,
  showTaskbars,
  setRoundedCorners,
};
