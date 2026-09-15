import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The audio devices, with the identifiers OBS stores.
 *
 * A `wasapi_output_capture` source is a device id and nothing else:
 *
 *   {0.0.0.00000000}.{c625702e-b28a-4288-ab67-36cb243f8c05}
 *
 * which is the MMDevice endpoint guid with a flow prefix: `0.0.0` for
 * playback, `0.0.1` for recording. Windows publishes the same guids, with the
 * friendly names people recognise, under `MMDevices\Audio` in the registry.
 * Checked against a real scene: the id above is the one this machine's OBS
 * already uses for a device Windows calls "Game".
 *
 * Chromium's own device list is no use here, because `enumerateDevices` hashes
 * its ids per origin and they have nothing to do with WASAPI.
 */

export interface AudioDevice {
  /** What OBS stores, verbatim. */
  id: string;
  /** The endpoint's own name, which is often `Speakers` on three of them. */
  name: string;
  /**
   * The hardware behind it: `Sound Blaster X3`, `Elgato Virtual Audio`.
   *
   * Without this the list reads as duplicates. Windows shows both lines in its
   * own sound settings for the same reason.
   */
  description: string;
  /** `output` is something playing, `input` is a microphone. */
  flow: 'output' | 'input';
  /** The system default, which OBS writes as the literal `default`. */
  isDefault: boolean;
}

/**
 * Only active endpoints, and only ones with a name.
 *
 * `$friendlyKey` rather than `$name`: PowerShell variable names are case
 * insensitive, so `$name = $props.$NAME` assigns to the variable it is reading
 * from, and every device after the first came back unnamed.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$friendlyKey = '{a45c254e-df1c-4efd-8020-67d146a850e0},2'
# The device description: the hardware, rather than the endpoint's own name.
$deviceKey = '{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
$found = @()

foreach ($flow in @(
  @{ Key = 'Render'; Prefix = '{0.0.0.00000000}'; Flow = 'output' },
  @{ Key = 'Capture'; Prefix = '{0.0.1.00000000}'; Flow = 'input' }
)) {
  $root = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\$($flow.Key)"
  foreach ($entry in (Get-ChildItem $root)) {
    $state = (Get-ItemProperty $entry.PSPath).DeviceState
    # Exactly 1, which is ACTIVE with no flags set.
    #
    # Masking the low nibble instead lets 0x10000001 through, and that high bit
    # is what Windows shows as "Disabled" in its own sound settings: a monitor
    # with speakers nobody uses, an unplugged line in, an old virtual device.
    # Twelve of those turned the list into a wall.
    if ($state -ne 1) { continue }

    $props = Get-ItemProperty (Join-Path $entry.PSPath 'Properties')
    $label = $props.$friendlyKey
    if (-not $label) { continue }

    $found += [PSCustomObject]@{
      flow        = $flow.Flow
      id          = "$($flow.Prefix).$($entry.PSChildName)"
      name        = $label
      description = [string]$props.$deviceKey
    }
  }
}

ConvertTo-Json -InputObject @($found) -Compress
`;

let cached: AudioDevice[] | null = null;

export async function audioDevices(): Promise<AudioDevice[]> {
  if (cached) return cached;
  if (process.platform !== 'win32') {
    cached = [];
    return cached;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'goodbit-audio-'));
  const file = path.join(dir, 'audio.ps1');

  try {
    writeFileSync(file, SCRIPT, 'utf-8');
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, timeout: 20_000, maxBuffer: 2 * 1024 * 1024 },
    );

    const parsed = JSON.parse(stdout.trim() || '[]') as
      | Array<{ id: string; name: string; description?: string; flow: 'output' | 'input' }>
      | { id: string; name: string; description?: string; flow: 'output' | 'input' };
    const list = Array.isArray(parsed) ? parsed : [parsed];

    cached = [
      // OBS's own default, which follows whatever Windows is playing through.
      // First, because it is the right answer for most people and the only one
      // that survives plugging a headset in.
      {
        id: 'default',
        name: 'Whatever Windows is using',
        description: 'Follows your default device, headsets included',
        flow: 'output',
        isDefault: true,
      },
      ...list.map((device) => ({
        ...device,
        description: device.description ?? '',
        isDefault: false,
      })),
    ];
  } catch (error) {
    console.warn(
      '[obs] could not list audio devices:',
      error instanceof Error ? error.message : error,
    );
    cached = [
      {
        id: 'default',
        name: 'Whatever Windows is using',
        description: 'Follows your default device, headsets included',
        flow: 'output',
        isDefault: true,
      },
    ];
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A temp file left behind is not worth reporting.
    }
  }

  return cached;
}
