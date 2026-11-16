// Real icons for Microsoft Store (packaged) apps.
//
// A Store app is identified by an AUMID such as
//   Microsoft.WindowsCalculator_8wekyb3d8bbwe!App
// (package family name ! application id). Its icon isn't embedded in an .exe: the package's
// AppxManifest.xml names a logo, e.g. Assets\CalculatorAppList.png, and Windows ships that
// logo as many variants (targetsize-24/32/48…, scale-100/200…, light/dark, high contrast).
// We find the package folder, read the manifest, and pick the variant the Start menu would.
const { nativeImage } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- package folders
let packages = null; // package family name (lower case) -> install folder
let packagesAt = 0;
let packagesPromise = null;

function loadPackages() {
  if (packagesPromise) return packagesPromise;
  packagesPromise = new Promise((resolve) => {
    const cmd = 'Get-AppxPackage | Select-Object PackageFamilyName, InstallLocation | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { timeout: 20000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        const map = new Map();
        if (!err) {
          try {
            const data = JSON.parse(stdout);
            for (const p of Array.isArray(data) ? data : [data]) {
              if (p && p.PackageFamilyName && p.InstallLocation) map.set(p.PackageFamilyName.toLowerCase(), p.InstallLocation);
            }
          } catch {}
        }
        packages = map;
        packagesAt = Date.now();
        packagesPromise = null;
        resolve(map);
      });
  });
  return packagesPromise;
}

// A running Store app's exe lives in ...\WindowsApps\<package full name>\..., which tells us
// the folder without asking PowerShell.
function folderFromExe(exe) {
  const m = /^(.*\\WindowsApps\\[^\\]+)\\/i.exec(exe || '');
  return m ? m[1] : null;
}

async function packageFolder(pfn, exeHint) {
  const fromExe = folderFromExe(exeHint);
  if (fromExe) return fromExe;
  const key = pfn.toLowerCase();
  if (!packages) await loadPackages();
  if (!packages.has(key) && Date.now() - packagesAt > 5 * 60 * 1000) await loadPackages(); // newly installed app
  return packages.get(key) || null;
}

// ---------------------------------------------------------------- manifest
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : null;
};

// The logo path (relative to the package folder) for one application in the manifest.
function logoFromManifest(xml, appId) {
  const apps = [...xml.matchAll(/<(?:\w+:)?Application\b[^>]*>[\s\S]*?<\/(?:\w+:)?Application>/gi)].map((m) => m[0]);
  const appXml = apps.find((a) => (attr(a.slice(0, a.indexOf('>') + 1), 'Id') || '').toLowerCase() === (appId || '').toLowerCase())
    || apps[0] || '';
  const ve = /<(?:\w+:)?VisualElements\b[^>]*>/i.exec(appXml);
  if (ve) {
    for (const name of ['Square44x44Logo', 'Square30x30Logo', 'SmallLogo', 'Square150x150Logo', 'Logo']) {
      const v = attr(ve[0], name);
      if (v && !/^ms-resource:/i.test(v)) return v.replace(/\//g, '\\');
    }
  }
  const pkgLogo = /<Properties\b[\s\S]*?<Logo>([^<]+)<\/Logo>/i.exec(xml);
  return pkgLogo ? pkgLogo[1].trim().replace(/\//g, '\\') : null;
}

// ---------------------------------------------------------------- picking a variant
// Given "Assets\CalculatorAppList.png", choose among files such as
//   CalculatorAppList.targetsize-48_altform-unplated.png  <- best: made for small icons, no plate
//   CalculatorAppList.targetsize-48.png
//   CalculatorAppList.scale-200.png
//   CalculatorAppList.png
function pickAsset(folder, logoRel, files) {
  const rel = logoRel.replace(/\\/g, path.sep);
  const dir = path.join(folder, path.dirname(rel));
  const ext = path.extname(rel).toLowerCase();
  const base = path.basename(rel, path.extname(rel)).toLowerCase();
  let list = files;
  if (!list) { try { list = fs.readdirSync(dir); } catch { return null; } }

  let best = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const lower = f.toLowerCase();
    if (!lower.endsWith(ext)) continue;
    const stem = lower.slice(0, -ext.length);
    if (stem !== base && !stem.startsWith(`${base}.`)) continue;
    const q = stem.slice(base.length); // e.g. ".targetsize-48_altform-unplated"
    if (/contrast-/.test(q)) continue; // high-contrast variants
    let score = 0;
    const ts = /targetsize-(\d+)/.exec(q);
    const sc = /scale-(\d+)/.exec(q);
    if (ts) score += 100 - Math.abs(Number(ts[1]) - 48) / 2;
    else if (sc) score += 60 - Math.abs(Number(sc[1]) - 200) / 10;
    else score += 20;
    if (/altform-unplated/.test(q)) score += 25;
    else if (/altform-lightunplated/.test(q)) score += 5; // made for light backgrounds
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best ? path.join(dir, best) : null;
}

// ---------------------------------------------------------------- public
const cache = new Map(); // aumid -> data URL | null

async function storeIcon(aumid, exeHint) {
  if (!aumid || !aumid.includes('!')) return null;
  if (cache.has(aumid)) return cache.get(aumid);
  let icon = null;
  try {
    const [pfn, appId] = aumid.split('!');
    const folder = await packageFolder(pfn, exeHint);
    if (!folder) return null; // not cached: the package list may simply be out of date
    {
      const xml = fs.readFileSync(path.join(folder, 'AppxManifest.xml'), 'utf8');
      const logo = logoFromManifest(xml, appId);
      const file = logo && pickAsset(folder, logo);
      if (file) {
        let img = nativeImage.createFromPath(file);
        if (!img.isEmpty()) {
          const { width } = img.getSize();
          if (width > 64) img = img.resize({ width: 64, height: 64, quality: 'best' });
          icon = img.toDataURL();
        }
      }
    }
  } catch {}
  cache.set(aumid, icon);
  return icon;
}

module.exports = { storeIcon, loadPackages, _test: { logoFromManifest, pickAsset, folderFromExe } };
