// Pinned apps: icons, launching, and the list of installed apps for the picker.
const { app, shell } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { storeIcon, loadPackages } = require('./store-icons');

const IS_WIN = process.platform === 'win32';
const LINK_EXT = /\.(lnk|url|appref-ms)$/i;
const SKIP = /\b(uninstall|uninst|readme|read me|release notes|help|manual|documentation|website|license|changelog|faq)\b/i;

const newId = () => crypto.randomBytes(6).toString('hex');

function displayName(p) {
  const base = path.basename(p.replace(/[\\/]+$/, ''));
  if (!base) return p; // e.g. a drive root such as D:\
  return LINK_EXT.test(base) || /\.exe$/i.test(base) ? base.replace(/\.[^.]+$/, '') : base;
}

// An entry is { id, name, path } for files, shortcuts and folders, or { id, name, aumid }
// for Microsoft Store apps (launched through the shell:AppsFolder namespace).
function entryForPath(p) {
  return { id: newId(), name: displayName(p), path: p };
}

function sameTarget(a, b) {
  if (a.aumid || b.aumid) return !!a.aumid && a.aumid === b.aumid;
  return !!a.path && !!b.path && path.resolve(a.path).toLowerCase() === path.resolve(b.path).toLowerCase();
}

// ---------------------------------------------------------------- icons
// entry: { path } for files/shortcuts/exes, { aumid } for Store apps; an open Store app may
// carry both (its exe path helps find the package).
async function iconFor(entry, size = 'large') {
  if (IS_WIN && entry.aumid) {
    const icon = await storeIcon(entry.aumid, entry.path);
    if (icon) return icon;
  }
  if (!entry.path) return null; // the dock shows the app's first letter instead
  try {
    const img = await app.getFileIcon(entry.path, { size });
    if (!img.isEmpty()) return img.toDataURL();
  } catch {}
  // A shortcut whose own icon can't be read: try what it points at.
  if (IS_WIN && /\.lnk$/i.test(entry.path)) {
    try {
      const link = shell.readShortcutLink(entry.path);
      for (const p of [link.icon, link.target]) {
        if (!p || !fs.existsSync(p)) continue;
        const img = await app.getFileIcon(p, { size });
        if (!img.isEmpty()) return img.toDataURL();
      }
    } catch {}
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------- launching
async function launch(entry) {
  if (entry.aumid) {
    spawn('explorer.exe', [`shell:AppsFolder\\${entry.aumid}`], { detached: true, stdio: 'ignore' }).unref();
    return '';
  }
  if (!fs.existsSync(entry.path)) return `${entry.name} can't be found. It may have been moved or uninstalled.`;
  return shell.openPath(entry.path); // '' on success, otherwise an error message
}

// ---------------------------------------------------------------- installed apps (picker)
function walkLinks(dir, out, depth = 0) {
  if (depth > 4) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkLinks(p, out, depth + 1);
    else if (LINK_EXT.test(e.name) && !SKIP.test(e.name)) out.push(p);
  }
}

function storeApps() {
  // Get-StartApps lists every app in the Start menu, including Microsoft Store apps.
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ConvertTo-Json -Compress'],
      { timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const data = JSON.parse(stdout);
          resolve((Array.isArray(data) ? data : [data])
            .filter((a) => a && a.Name && typeof a.AppID === 'string' && a.AppID.includes('!'))
            .map((a) => ({ name: a.Name, aumid: a.AppID })));
        } catch { resolve([]); }
      });
  });
}

let catalog = null;
let catalogAt = 0;
let catalogPromise = null;

async function buildCatalog() {
  if (!IS_WIN) return [];
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
  const links = [];
  for (const r of roots) walkLinks(r, links);

  const byName = new Map();
  for (const p of links) {
    const name = displayName(p);
    const k = name.toLowerCase();
    if (!byName.has(k)) byName.set(k, { key: `lnk:${p.toLowerCase()}`, name, path: p });
  }
  const [store] = await Promise.all([storeApps(), loadPackages()]); // both PowerShell, run together
  for (const a of store) {
    const k = a.name.toLowerCase();
    if (!byName.has(k)) byName.set(k, { key: `app:${a.aumid}`, name: a.name, aumid: a.aumid });
  }
  const items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const icons = await mapLimit(items, 8, (it) => iconFor(it, 'normal'));
  items.forEach((it, i) => { it.icon = icons[i]; });
  return items;
}

async function getCatalog() {
  if (catalog && Date.now() - catalogAt < 10 * 60 * 1000) return catalog;
  if (!catalogPromise) {
    catalogPromise = buildCatalog()
      .then((items) => { catalog = items; catalogAt = Date.now(); return items; })
      .finally(() => { catalogPromise = null; });
  }
  return catalogPromise;
}

function cachedCatalog() { return catalog; }

function catalogItem(key) {
  return (catalog || []).find((it) => it.key === key) || null;
}

module.exports = { cachedCatalog, entryForPath, sameTarget, iconFor, launch, getCatalog, catalogItem, newId, IS_WIN };
