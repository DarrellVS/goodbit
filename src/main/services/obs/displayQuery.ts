/**
 * Asking Windows about the screens, through the only API that knows.
 *
 * Two questions have the same answer source, and nothing in Node or Electron
 * can reach either:
 *
 * - **Which device is this screen?** OBS identifies a display capture source by
 *   a device interface path (`\\?\DISPLAY#MSI3DC4#…#{e6f07b5f-…}`), and gets it
 *   from `DisplayConfigGetDeviceInfo` with `GET_TARGET_NAME`.
 * - **Is it in HDR mode?** The same call with `GET_ADVANCED_COLOR_INFO`.
 *
 * The second one matters more than it looks. Chromium's answer, which Electron
 * exposes as `colorDepth` and `depthPerComponent`, reported 8 bits per channel
 * on a display this API reports as HDR-enabled, and the research warned it
 * would: on Windows, Chromium's colour space for an HDR display comes back as
 * P3/sRGB rather than anything mentioning PQ. Believing it means recording an
 * HDR display as SDR, which clips the highlights at capture time. That damage
 * is in the file for good, and tone mapping afterwards cannot undo it, which is
 * exactly what "washed out compared to my own profile" looks like.
 *
 * So: a small C# shim, compiled by PowerShell at the moment it is needed. Not
 * a native addon, because a compiled dependency for two strings is a build
 * problem on every machine forever; not a bundled executable, because this has
 * to survive an unsigned installer. The script is written to a temporary file
 * rather than passed as `-Command`, since it contains the kind of quoting that
 * does not survive a command line.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface WindowsDisplay {
  /** The EDID name, which is also what Electron calls the display. */
  friendlyName: string;
  /** Exactly what OBS stores in a `monitor_capture` source. */
  devicePath: string;
  hdrSupported: boolean;
  /**
   * HDR is on for this display right now.
   *
   * `advancedColorEnabled` alone is not the question since Windows 11 22H2,
   * because an auto colour managed SDR display sets it too. The test is that
   * bit together with `wideColorEnforced` being clear.
   */
  hdrEnabled: boolean;
  bitsPerChannel: number;
}

/**
 * The shim. Sequential layouts straight from `wingdi.h`.
 *
 * `MODE` is deliberately opaque: only the path array is read, and spelling out
 * a union of video signal timings to skip over it is a lot of struct for
 * nothing. It only has to be large enough that the array Windows fills is not
 * overrun, which `Marshal.SizeOf` then reports honestly.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Runtime.InteropServices;

public static class GoodBitDisplays
{
    [StructLayout(LayoutKind.Sequential)]
    public struct LUID { public uint LowPart; public int HighPart; }

    [StructLayout(LayoutKind.Sequential)]
    public struct SOURCE { public LUID adapterId; public uint id; public uint modeInfoIdx; public uint statusFlags; }

    [StructLayout(LayoutKind.Sequential)]
    public struct TARGET
    {
        public LUID adapterId; public uint id; public uint modeInfoIdx;
        public uint outputTechnology; public uint rotation; public uint scaling;
        public uint refreshNumerator; public uint refreshDenominator;
        public uint scanLineOrdering; public int targetAvailable; public uint statusFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PATH { public SOURCE sourceInfo; public TARGET targetInfo; public uint flags; }

    [StructLayout(LayoutKind.Sequential)]
    public struct MODE
    {
        public uint infoType; public uint id; public LUID adapterId;
        public ulong a; public ulong b; public ulong c; public ulong d;
        public ulong e; public ulong f; public ulong g; public ulong h;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HEADER { public uint type; public uint size; public LUID adapterId; public uint id; }

    [StructLayout(LayoutKind.Sequential)]
    public struct COLOR { public HEADER header; public uint value; public uint colorEncoding; public uint bits; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct TARGET_NAME
    {
        public HEADER header;
        public uint flags;
        public uint outputTechnology;
        public ushort edidManufactureId;
        public ushort edidProductCodeId;
        public uint connectorInstance;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string friendly;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string devicePath;
    }

    [DllImport("user32.dll")]
    public static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);

    [DllImport("user32.dll")]
    public static extern int QueryDisplayConfig(uint flags, ref uint paths, [Out] PATH[] pathArray, ref uint modes, [Out] MODE[] modeArray, IntPtr topology);

    [DllImport("user32.dll")]
    public static extern int DisplayConfigGetDeviceInfo(ref COLOR packet);

    [DllImport("user32.dll")]
    public static extern int DisplayConfigGetDeviceInfo(ref TARGET_NAME packet);

    public static int ColorSize() { return Marshal.SizeOf(typeof(COLOR)); }
    public static int NameSize() { return Marshal.SizeOf(typeof(TARGET_NAME)); }
}
'@

Add-Type -TypeDefinition $source

$QDC_ONLY_ACTIVE_PATHS = 2
$pathCount = 0
$modeCount = 0
if ([GoodBitDisplays]::GetDisplayConfigBufferSizes($QDC_ONLY_ACTIVE_PATHS, [ref]$pathCount, [ref]$modeCount) -ne 0) {
  '[]'
  exit
}

$paths = New-Object 'GoodBitDisplays+PATH[]' $pathCount
$modes = New-Object 'GoodBitDisplays+MODE[]' $modeCount
if ([GoodBitDisplays]::QueryDisplayConfig($QDC_ONLY_ACTIVE_PATHS, [ref]$pathCount, $paths, [ref]$modeCount, $modes, [IntPtr]::Zero) -ne 0) {
  '[]'
  exit
}

$found = @()
for ($i = 0; $i -lt $pathCount; $i++) {
  $target = $paths[$i].targetInfo

  $name = New-Object 'GoodBitDisplays+TARGET_NAME'
  $nameHeader = New-Object 'GoodBitDisplays+HEADER'
  $nameHeader.type = 2
  $nameHeader.size = [GoodBitDisplays]::NameSize()
  $nameHeader.adapterId = $target.adapterId
  $nameHeader.id = $target.id
  $name.header = $nameHeader
  if ([GoodBitDisplays]::DisplayConfigGetDeviceInfo([ref]$name) -ne 0) { continue }

  $colour = New-Object 'GoodBitDisplays+COLOR'
  $colourHeader = New-Object 'GoodBitDisplays+HEADER'
  $colourHeader.type = 9
  $colourHeader.size = [GoodBitDisplays]::ColorSize()
  $colourHeader.adapterId = $target.adapterId
  $colourHeader.id = $target.id
  $colour.header = $colourHeader
  $colourOk = [GoodBitDisplays]::DisplayConfigGetDeviceInfo([ref]$colour) -eq 0

  $supported = $colourOk -and (($colour.value -band 1) -ne 0)
  $enabled = $colourOk -and (($colour.value -band 2) -ne 0)
  $wideEnforced = $colourOk -and (($colour.value -band 4) -ne 0)

  $found += [PSCustomObject]@{
    friendlyName   = $name.friendly
    devicePath     = $name.devicePath
    hdrSupported   = [bool]$supported
    hdrEnabled     = [bool]($enabled -and -not $wideEnforced)
    bitsPerChannel = [int]$colour.bits
  }
}

ConvertTo-Json -InputObject @($found) -Compress
`;

let cached: WindowsDisplay[] | null = null;

/**
 * The screens, as Windows sees them.
 *
 * Cached for the life of the process. Plugging a monitor in mid-session is not
 * something this setup has to follow, and the alternative is compiling C# on
 * every render of a settings screen.
 */
export async function windowsDisplays(): Promise<WindowsDisplay[]> {
  if (cached) return cached;
  if (process.platform !== 'win32') {
    cached = [];
    return cached;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'goodbit-displays-'));
  const file = path.join(dir, 'displays.ps1');

  try {
    writeFileSync(file, SCRIPT, 'utf-8');
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 },
    );

    const parsed = JSON.parse(stdout.trim() || '[]') as WindowsDisplay | WindowsDisplay[];
    // A single object rather than an array is what ConvertTo-Json does with one
    // item on older PowerShell, even wrapped.
    cached = Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.warn(
      '[obs] could not ask Windows about the displays:',
      error instanceof Error ? error.message : error,
    );
    cached = [];
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A temp file left behind is not worth reporting.
    }
  }

  return cached;
}
