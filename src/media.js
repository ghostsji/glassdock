// Volume and "now playing" (Windows only).
//
// One long-running PowerShell helper does the work:
//  - volume and mute through the Windows Core Audio API (a few lines of C#), and
//  - media info and play/pause/next/previous/seek through the same system media service
//    that powers Windows' own media flyout (works with Spotify, browsers, most players).
// GlassDock sends it one JSON request per line on stdin; it answers one JSON line on stdout.
const { spawn } = require('child_process');

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

$mgr = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1'
  })[0]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  function Await($op, [Type]$type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(5000)
    return $task.Result
  }
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
let buffer = '';
let seq = 0;
const pending = new Map();
let crashes = [];
let disabled = false;

function start() {
  if (disabled) throw new Error('media helper disabled after repeated failures');
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  proc = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
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
}

module.exports = { call, stop, isDisabled: () => disabled };
