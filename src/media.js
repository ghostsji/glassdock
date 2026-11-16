// Volume and "now playing" (Windows only).
//
// One long-running PowerShell helper does the work:
//  - volume and mute through the Windows Core Audio API (a few lines of C#), and
//  - media info and play/pause/next/previous/seek through the same system media service
//    that powers Windows' own media flyout (works with Spotify, browsers, most players).
// GlassDock sends it one JSON request per line on stdin; it answers one JSON line on stdout.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p);
  int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out uint n);
  int SetMasterVolumeLevel(float db, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
  int GetMasterVolumeLevel(out float db);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
  int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
  int GetChannelVolumeLevel(uint ch, out float db);
  int GetChannelVolumeLevelScalar(uint ch, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
}

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator { }

public static class GdAudio {
  static IAudioEndpointVolume Endpoint() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0 /* render */, 1 /* multimedia */, out dev));
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23 /* CLSCTX_ALL */, IntPtr.Zero, out o));
    return (IAudioEndpointVolume)o;
  }
  public static float GetVolume() { float v; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void SetVolume(float v) { Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), ref g)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Endpoint().SetMute(m, ref g)); }
}
'@

$asTaskGeneric = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1'
  })[0]
} catch {}
function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$task.Wait(5000)
  return $task.Result
}

$mgr = $null
try {
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { $mgr = $null }

$script:lastKey = ''
$script:lastThumb = $null

function Get-Media([bool]$forceThumb) {
  if (-not $mgr) { return $null }
  $s = $mgr.GetCurrentSession()
  if (-not $s) { return $null }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $s.GetPlaybackInfo()
  $tl = $s.GetTimelineProperties()
  $key = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
  $send = $forceThumb
  if ($key -ne $script:lastKey) {
    $script:lastKey = $key
    $script:lastThumb = $null
    $send = $true
    if ($p.Thumbnail) {
      try {
        $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $size = [uint32][Math]::Min($stream.Size, 3MB)
        $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
        [void](Await ($reader.LoadAsync($size)) ([uint32]))
        $bytes = New-Object byte[] $size
        $reader.ReadBytes($bytes)
        $type = if ($stream.ContentType) { $stream.ContentType } else { 'image/png' }
        $script:lastThumb = "data:$type;base64," + [Convert]::ToBase64String($bytes)
        $reader.Dispose(); $stream.Dispose()
      } catch { $script:lastThumb = $null }
    }
  }
  $c = $info.Controls
  return @{
    key = $key
    app = [string]$s.SourceAppUserModelId
    title = [string]$p.Title
    artist = [string]$p.Artist
    album = [string]$p.AlbumTitle
    status = [string]$info.PlaybackStatus
    canPlayPause = [bool]($c.IsPlayPauseToggleEnabled -or $c.IsPlayEnabled -or $c.IsPauseEnabled)
    canNext = [bool]$c.IsNextEnabled
    canPrev = [bool]$c.IsPreviousEnabled
    canSeek = [bool]$c.IsPlaybackPositionEnabled
    position = [double]$tl.Position.TotalSeconds
    duration = [double]($tl.EndTime - $tl.StartTime).TotalSeconds
    updated = [int64]$tl.LastUpdatedTime.ToUnixTimeMilliseconds()
    thumbIncluded = [bool]$send
    thumb = $(if ($send) { $script:lastThumb } else { $null })
  }
}

# ---- network: adapter counters (.NET, in-process) and Wi-Fi name/signal (netsh, cached 10 s)
$script:wifiAt = [DateTime]::MinValue
$script:wifi = $null
function Get-Wifi {
  if (([DateTime]::Now - $script:wifiAt).TotalSeconds -lt 10) { return $script:wifi }
  $script:wifiAt = [DateTime]::Now
  $w = $null
  try {
    $out = @(netsh wlan show interfaces 2>$null)
    $ssidLine = $out | Where-Object { $_ -match '^\s*SSID\s*:' } | Select-Object -First 1
    $sigLine = $out | Where-Object { $_ -match ':\s*\d+\s*%\s*$' } | Select-Object -First 1
    $w = @{
      ssid = $(if ($ssidLine) { ($ssidLine -replace '^\s*SSID\s*:\s*', '').Trim() } else { '' })
      signal = $(if ($sigLine) { [int]($sigLine -replace '^.*:\s*(\d+)\s*%\s*$', '$1') } else { $null })
      text = (($out -join ' ') -replace '\s+', ' ')
    }
    # Windows 11 hides the Wi-Fi name from apps unless location access is allowed
    $w.locationBlocked = [bool]((-not $w.ssid) -and ($w.text -match 'location|ms-settings:privacy'))
    $w.Remove('text')
  } catch { $w = $null }
  $script:wifi = $w
  return $w
}

function Get-Net {
  $list = @()
  foreach ($i in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    try {
      if ($i.OperationalStatus -ne 'Up') { continue }
      $type = [string]$i.NetworkInterfaceType
      if ($type -eq 'Loopback' -or $type -eq 'Tunnel') { continue }
      $st = $i.GetIPStatistics()
      $p = $i.GetIPProperties()
      $ipv4 = @($p.UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.Address.ToString() })
      $gw = @($p.GatewayAddresses | ForEach-Object { $_.Address.ToString() } | Where-Object { $_ -and $_ -ne '0.0.0.0' -and $_ -notmatch ':' })
      $list += @{ id = $i.Id; name = $i.Name; desc = $i.Description; type = $type; speed = [int64]$i.Speed;
        rx = [int64]$st.BytesReceived; tx = [int64]$st.BytesSent; ipv4 = $ipv4; gateway = $gw }
    } catch {}
  }
  $hasWifi = @($list | Where-Object { $_.type -eq 'Wireless80211' }).Count -gt 0
  return @{ adapters = $list; wifi = $(if ($hasWifi) { Get-Wifi } else { $null }) }
}

# ---- quick settings: radios (Wi-Fi, Bluetooth), laptop brightness, power mode, sleep
$script:radiosOk = $false
try {
  [void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
  [void][Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime]
  [void][Windows.Devices.Radios.RadioState, Windows.System.Devices, ContentType = WindowsRuntime]
  [void](Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]))
  $script:radiosOk = $true
} catch {}

function Get-RadioList {
  return Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
}

function Get-QuickSettings {
  $radios = @()
  if ($script:radiosOk) {
    try { $radios = @(Get-RadioList | ForEach-Object { @{ kind = [string]$_.Kind; state = [string]$_.State; name = [string]$_.Name } }) } catch {}
  }
  $bright = $null
  try {
    $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1
    if ($b) { $bright = [int]$b.CurrentBrightness }
  } catch {}
  $overlay = $null
  try {
    $o = (powercfg /getactiveoverlayscheme 2>$null) | Out-String
    if ($o -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { $overlay = $Matches[1].ToLower() }
  } catch {}
  return @{ radios = $radios; brightness = $bright; overlay = $overlay }
}

function Set-Radio([string]$kind, [bool]$on) {
  $state = if ($on) { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
  foreach ($r in (Get-RadioList)) {
    if ([string]$r.Kind -eq $kind) { [void](Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])) }
  }
}

function Set-Brightness([int]$v) {
  $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1
  [void](Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]([Math]::Max(0, [Math]::Min(100, $v))) })
}

function With-Session($fn) {
  if (-not $mgr) { return }
  $s = $mgr.GetCurrentSession()
  if ($s) { & $fn $s }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $req = $null
  try { $req = $line | ConvertFrom-Json } catch { continue }
  $res = @{ id = $req.id; ok = $true }
  if (@('qs', 'radio', 'brightness', 'overlay', 'sleep') -contains $req.cmd) {
    try {
      switch ($req.cmd) {
        'radio' { if (@('WiFi', 'Bluetooth', 'MobileBroadband') -contains [string]$req.arg.kind) { Set-Radio ([string]$req.arg.kind) ([bool]$req.arg.on) } }
        'brightness' { Set-Brightness ([int]$req.arg) }
        'overlay' { if ([string]$req.arg -match '^[0-9a-f-]{36}$') { [void](powercfg /overlaysetactive ([string]$req.arg) 2>$null) } }
        'sleep' { Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false) }
      }
    } catch { $res.ok = $false; $res.error = $_.Exception.Message }
    try { $res.qs = Get-QuickSettings } catch { $res.qs = $null }
    [Console]::Out.WriteLine(($res | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
    continue
  }
  if ($req.cmd -eq 'net') {
    try { $res.net = Get-Net } catch { $res.ok = $false; $res.error = $_.Exception.Message }
    [Console]::Out.WriteLine(($res | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
    continue
  }
  try {
    switch ($req.cmd) {
      'volume' { [GdAudio]::SetVolume([float]$req.arg); if ([GdAudio]::GetMute()) { [GdAudio]::SetMute($false) } }
      'mute'   { [GdAudio]::SetMute([bool]$req.arg) }
      'play'   { With-Session { param($s) [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) } }
      'next'   { With-Session { param($s) [void](Await ($s.TrySkipNextAsync()) ([bool])) } }
      'prev'   { With-Session { param($s) [void](Await ($s.TrySkipPreviousAsync()) ([bool])) } }
      'seek'   { With-Session { param($s) [void](Await ($s.TryChangePlaybackPositionAsync([int64]([double]$req.arg * 10000000))) ([bool])) } }
    }
  } catch { $res.ok = $false; $res.error = $_.Exception.Message }
  try { $res.volume = @{ level = [GdAudio]::GetVolume(); muted = [GdAudio]::GetMute() } } catch { $res.volume = $null }
  try { $res.media = Get-Media ([bool]($req.cmd -eq 'state' -and $req.arg)) } catch { $res.media = $null }
  [Console]::Out.WriteLine(($res | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}
`;

let proc = null;
let scriptFile = null;
let buffer = '';
let seq = 0;
const pending = new Map();
let crashes = [];
let disabled = false;

function start() {
  if (disabled) throw new Error('media helper disabled after repeated failures');
  // Written fresh each start into your own temp folder; the BOM makes PowerShell 5 read it as UTF-8.
  const file = path.join(os.tmpdir(), `glassdock-helper-${process.pid}.ps1`);
  fs.writeFileSync(file, `\ufeff${SCRIPT}`, 'utf8');
  scriptFile = file;
  proc = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  buffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('{')) continue; // anything else is PowerShell chatter
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p.resolve(msg); }
    }
  });
  proc.stderr.on('data', (d) => console.error('[media helper]', String(d).trim()));
  proc.on('exit', () => {
    proc = null;
    for (const p of pending.values()) p.reject(new Error('media helper exited'));
    pending.clear();
    const now = Date.now();
    crashes = crashes.filter((t) => now - t < 60000).concat(now);
    if (crashes.length >= 3) disabled = true; // don't keep respawning a broken helper
  });
}

function call(cmd, arg) {
  if (!proc) start();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('media helper timed out')); }, 15000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    proc.stdin.write(`${JSON.stringify({ id, cmd, arg })}\n`);
  });
}

function stop() {
  if (proc) { try { proc.stdin.end(); proc.kill(); } catch {} }
  proc = null;
  if (scriptFile) { try { fs.unlinkSync(scriptFile); } catch {} scriptFile = null; }
}

module.exports = { call, stop, isDisabled: () => disabled };
