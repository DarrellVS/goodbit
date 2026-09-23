import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { userDataDir } from '../../settings.js';
import { isVideoFile } from '@shared/constants/videoFiles.js';
import { incomingDir } from '../capture/incoming.js';
import { readObs } from './config.js';
import { obsIsRunning } from './paths.js';
import { replayChord, type KeyChord } from './replayHotkey.js';

const run = promisify(execFile);

/**
 * Save the replay buffer, from outside OBS, without talking to OBS.
 *
 * See `replayHotkey.ts` for why this presses a key rather than opening
 * obs-websocket. What that costs, said plainly: **the key goes to whatever is
 * in front**, which is the game, exactly as it does when the key on the
 * keyboard is pressed. OBS hears it because its hotkeys are global. A game
 * that also uses that key would see it too, and that is already true of the
 * key the user presses by hand.
 *
 * **The answer is the file, not the keypress.** A key sent says a request was
 * made, not that a clip exists: the buffer may not be running, the profile in
 * OBS may be a different one, or OBS may be asking a question in a window
 * behind the game. So this waits for a new recording to appear in the folder
 * OBS writes to, and says "saved" only then. The same rule the clip toast
 * follows: the receipt fires on the file, never on the key.
 */

export type SaveReplayResult =
  | { saved: true; file: string; key: string }
  | {
      saved: false;
      reason: 'not-windows' | 'obs-off' | 'no-hotkey' | 'unsupported-key' | 'nothing-landed' | 'helper';
      message: string;
      key?: string;
    };

/** How long a replay has to land before the key says it did not. */
const LAND_TIMEOUT_MS = 12_000;

/**
 * The shim: press a chord, and let go.
 *
 * `SendInput` rather than `keybd_event`, which Microsoft superseded, and a
 * held key for 60 ms because OBS reads its hotkeys by polling the key state
 * rather than from the message queue, so an instant down-and-up can fall
 * between two of its samples.
 */
const SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class GoodBitKeys
{
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    static extern uint MapVirtualKey(uint uCode, uint uMapType);

    const uint KEYUP = 0x0002;

    static void Key(ushort vk, bool up)
    {
        INPUT input = new INPUT();
        input.type = 1;
        input.u.ki.wVk = vk;
        input.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        input.u.ki.dwFlags = up ? KEYUP : 0;
        if (SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT))) != 1)
            throw new Exception("SendInput refused the key: " + Marshal.GetLastWin32Error());
    }

    public static int Main(string[] args)
    {
        try
        {
            ushort vk = ushort.Parse(args[0]);
            bool ctrl = args[1] == "1", alt = args[2] == "1", shift = args[3] == "1";
            if (ctrl) Key(0x11, false);
            if (alt) Key(0x12, false);
            if (shift) Key(0x10, false);
            Key(vk, false);
            Thread.Sleep(60);
            Key(vk, true);
            if (shift) Key(0x10, true);
            if (alt) Key(0x12, true);
            if (ctrl) Key(0x11, true);
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e.Message);
            return 1;
        }
    }
}
`;

const STAMP = createHash('sha256').update(SOURCE).digest('hex').slice(0, 16);

function binDir(): string {
  const dir = path.join(userDataDir(), 'bin');
  mkdirSync(dir, { recursive: true });
  return dir;
}

const helperPath = (): string => path.join(binDir(), 'gb-keys.exe');
const stampPath = (): string => path.join(binDir(), 'gb-keys.stamp');

function current(): boolean {
  if (!existsSync(helperPath())) return false;
  try {
    return readFileSync(stampPath(), 'utf-8').trim() === STAMP;
  } catch {
    return false;
  }
}

let building: Promise<string | null> | null = null;

/** Compiled on first use, the same way the foreground helper is. */
async function ensureHelper(): Promise<string | null> {
  if (current()) return helperPath();
  if (building) return building;
  building = (async () => {
    const target = helperPath();
    const dir = mkdtempSync(path.join(os.tmpdir(), 'goodbit-keys-'));
    const script = path.join(dir, 'build.ps1');
    try {
      writeFileSync(
        script,
        [
          "$ErrorActionPreference = 'Stop'",
          `$source = @'\n${SOURCE}\n'@`,
          `Add-Type -TypeDefinition $source -OutputAssembly '${target}' -OutputType ConsoleApplication`,
        ].join('\n'),
        'utf-8',
      );
      await run(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
        { windowsHide: true, timeout: 60_000 },
      );
      if (!existsSync(target)) throw new Error('Add-Type reported success and wrote nothing');
      writeFileSync(stampPath(), STAMP, 'utf-8');
      return target;
    } catch (error) {
      console.warn('[replay] could not build the key helper:', error instanceof Error ? error.message : error);
      return null;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })().finally(() => {
    building = null;
  });
  return building;
}

/** Warm the helper at boot, so the first press in a game is not a compile. */
export function prepareReplayKey(): void {
  if (process.platform === 'win32') void ensureHelper();
}

/**
 * Which profile OBS is recording with, as far as can be told from its files.
 *
 * GoodBit starts OBS on its own profile, so that one wins when it exists;
 * otherwise the one OBS last had active.
 */
function recordingProfile() {
  const obs = readObs();
  return obs.profiles.find((profile) => profile.name === 'GoodBit') ?? obs.activeProfile;
}

async function newestSince(folder: string, since: number): Promise<string | null> {
  let names: string[];
  try {
    names = await fs.readdir(folder);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!isVideoFile(name)) continue;
    try {
      const stat = await fs.stat(path.join(folder, name));
      if (Math.max(stat.birthtimeMs, stat.mtimeMs) >= since) return path.join(folder, name);
    } catch {
      // Filed away between the listing and the stat, which means it landed.
      return path.join(folder, name);
    }
  }
  return null;
}

async function press(chord: KeyChord): Promise<boolean> {
  const helper = await ensureHelper();
  if (!helper) return false;
  try {
    await run(helper, [String(chord.vk), chord.ctrl ? '1' : '0', chord.alt ? '1' : '0', chord.shift ? '1' : '0'], {
      windowsHide: true,
      timeout: 5_000,
    });
    return true;
  } catch (error) {
    console.warn('[replay] the key helper failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function saveReplay(): Promise<SaveReplayResult> {
  if (process.platform !== 'win32') {
    return { saved: false, reason: 'not-windows', message: 'Saving the replay from here works on Windows only.' };
  }
  if (!(await obsIsRunning())) {
    return { saved: false, reason: 'obs-off', message: 'OBS is not running, so there is no replay to save.' };
  }

  const profile = recordingProfile();
  const chord = replayChord(profile?.saveReplayHotkey ?? null);
  if (!chord) {
    return {
      saved: false,
      reason: 'no-hotkey',
      message: 'OBS has no key bound to Save Replay. Bind one in OBS, or run the setup in GoodBit.',
    };
  }
  if ('unsupported' in chord) {
    return {
      saved: false,
      reason: 'unsupported-key',
      key: chord.unsupported,
      message: `OBS saves the replay on ${chord.unsupported}, which GoodBit cannot press. Bind a keyboard key.`,
    };
  }

  // OBS writes the replay where the profile records; GoodBit's own setup
  // points that at the staging folder, which files it after.
  const folder = profile?.recordingPath || incomingDir();
  const since = Date.now() - 500;

  if (!(await press(chord))) {
    return { saved: false, reason: 'helper', key: chord.label, message: 'GoodBit could not press the key.' };
  }

  const deadline = Date.now() + LAND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const file = await newestSince(folder, since);
    if (file) return { saved: true, file, key: chord.label };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    saved: false,
    reason: 'nothing-landed',
    key: chord.label,
    message: `Pressed ${chord.label} and no replay arrived. Is the replay buffer running in OBS?`,
  };
}
