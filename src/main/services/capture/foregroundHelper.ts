/**
 * Asking Windows which program the user is actually looking at.
 *
 * OBS cannot name a file after a game, so GoodBit names it, from whatever was
 * in front while the replay was recording. All that takes is a
 * `GetForegroundWindow` and a process path, and neither Node nor Electron can
 * reach either.
 *
 * So: a small C# console program, compiled by PowerShell the first time it is
 * wanted and cached in `%APPDATA%/GoodBit/bin/`. The same trade
 * `displayQuery.ts` already makes, for the same reasons: not a native addon,
 * because a compiled dependency is a build problem on every machine forever;
 * not a bundled executable, because this has to survive an unsigned installer.
 *
 * It differs from `displayQuery.ts` in one way that matters. That shim answers
 * a question and exits; this one runs for as long as GoodBit does, printing a
 * line per sample, so it is compiled to an executable rather than run through
 * PowerShell. A resident `powershell.exe` costs about 78 MB; this costs 13 MB
 * and 0.11% of one core.
 *
 * **`PROCESS_QUERY_LIMITED_INFORMATION` is load bearing.** The obvious pair,
 * `PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`, is denied outright by a
 * protected process while the limited right is allowed. Ask for the pair and
 * the games most likely to be protected are exactly the ones that cannot be
 * named, and those clips land with no game at all.
 *
 * ## It also answers "is that one still running"
 *
 * Naming a clip only needs what is in front. Knowing that a *session* ended
 * needs something the samples cannot say: a game alt-tabbed away from and a
 * game that has exited look identical from here, because both simply stop
 * appearing.
 *
 * So the helper takes a pid to track, on stdin, and reports whether it is
 * alive once a second alongside the samples. `process.kill(pid, 0)` from Node
 * would answer the same question and is the wrong answer to this one: pids are
 * reused on Windows, quickly, so it can end up describing a different program.
 * **A held handle pins the pid**, and this helper already opens one per sample.
 * Keeping one open costs nothing on top of 0.11% of a core.
 *
 * **`GetExitCodeProcess`, not `WaitForSingleObject`**, and that cost a
 * debugging session. Waiting on a process handle is the obvious test and it
 * needs the `SYNCHRONIZE` right, which `PROCESS_QUERY_LIMITED_INFORMATION`
 * does not grant: the call fails, returns `WAIT_FAILED`, and a failure that is
 * not `WAIT_OBJECT_0` reads as "still running". Measured against a process
 * that had definitely been killed, it reported `alive` for as long as it was
 * asked. Asking for `SYNCHRONIZE` as well would fix it and would be the same
 * mistake as `PROCESS_VM_READ` above: the games most likely to be protected
 * are exactly the ones a wider request fails on. `GetExitCodeProcess` needs
 * only the right already held, and `STILL_ACTIVE` is its answer for a process
 * that has not finished. A process that genuinely exits *with* code 259 reads
 * as alive for ever, which means a sweep that never fires, which is the safe
 * direction.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { userDataDir } from '../../settings.js';

const run = promisify(execFile);

/**
 * The shim.
 *
 * `QueryFullProcessImageNameW` rather than `GetModuleFileNameEx`: Microsoft's
 * own recommendation, and the one that works against a protected process.
 * Tab separated rather than JSON because this prints a line a second forever
 * and the reader is twenty lines of `split`.
 */
const SOURCE = String.raw`
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;

public static class GoodBitForeground
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr handle, out uint code);

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint STILL_ACTIVE = 259;

    // The tracked process, and the handle that stops its pid being reused
    // under us. Guarded, because stdin is read on its own thread.
    private static readonly object trackLock = new object();
    private static IntPtr tracked = IntPtr.Zero;
    private static uint trackedPid = 0;
    private static bool trackedOpened = false;

    private static void Track(uint pid)
    {
        lock (trackLock)
        {
            if (tracked != IntPtr.Zero) CloseHandle(tracked);
            tracked = pid == 0 ? IntPtr.Zero : OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            trackedPid = pid;
            // Whether the handle was ever obtained, which is how "gone" is told
            // apart from "never opened". Reporting a process we could not open
            // as exited would end a session somebody is still playing.
            trackedOpened = tracked != IntPtr.Zero;
        }
    }

    private static string TrackedState()
    {
        lock (trackLock)
        {
            if (trackedPid == 0) return "";
            if (!trackedOpened) return "unknown";

            uint code;
            if (!GetExitCodeProcess(tracked, out code)) return "unknown";
            return code == STILL_ACTIVE ? "alive" : "exited";
        }
    }

    private static void ReadCommands()
    {
        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            string[] parts = line.Trim().Split(' ');
            if (parts.Length == 0) continue;

            if (parts[0] == "T" && parts.Length > 1)
            {
                uint pid;
                if (uint.TryParse(parts[1], out pid)) Track(pid);
            }
            else if (parts[0] == "U")
            {
                Track(0);
            }
        }
    }

    private static string PathFor(uint pid)
    {
        IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (handle == IntPtr.Zero) return "";

        try
        {
            StringBuilder name = new StringBuilder(1024);
            uint size = 1024;
            return QueryFullProcessImageName(handle, 0, name, ref size) ? name.ToString() : "";
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    public static int Main(string[] args)
    {
        int intervalMs = 1000;
        if (args.Length > 0) int.TryParse(args[0], out intervalMs);
        if (intervalMs < 100) intervalMs = 100;

        DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        Thread commands = new Thread(ReadCommands);
        commands.IsBackground = true;
        commands.Start();

        while (true)
        {
            IntPtr window = GetForegroundWindow();
            uint pid = 0;
            string exe = "";

            if (window != IntPtr.Zero)
            {
                GetWindowThreadProcessId(window, out pid);
                if (pid != 0) exe = PathFor(pid);
            }

            long now = (long)(DateTime.UtcNow - epoch).TotalMilliseconds;
            Console.WriteLine(now + "\t" + pid + "\t" + exe);

            // A second line, and only while something is being tracked. It
            // starts with a letter rather than a timestamp, so a reader that
            // knows nothing about it parses NaN and skips it.
            string state = TrackedState();
            if (state.Length > 0) Console.WriteLine("L\t" + trackedPid + "\t" + state);

            Console.Out.Flush();
            Thread.Sleep(intervalMs);
        }
    }
}
`;

/** Rebuilt when the source changes, so an edit here cannot be shadowed by a stale exe. */
const STAMP = createHash('sha256').update(SOURCE).digest('hex').slice(0, 16);

function binDir(): string {
  const dir = path.join(userDataDir(), 'bin');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function helperPath(): string {
  return path.join(binDir(), 'gb-foreground.exe');
}

function stampPath(): string {
  return path.join(binDir(), 'gb-foreground.stamp');
}

/** Is the cached executable the one this source would produce? */
function current(): boolean {
  if (!existsSync(helperPath())) return false;
  try {
    return readFileSync(stampPath(), 'utf-8').trim() === STAMP;
  } catch {
    return false;
  }
}

let building: Promise<string | null> | null = null;

/**
 * The helper, compiled if it has to be.
 *
 * Null on any failure, including a machine that is not Windows. A missing
 * helper means clips land in `Unsorted`, which is worse than a game name and
 * much better than a crash on the boot path.
 */
export async function ensureHelper(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  if (current()) return helperPath();
  if (building) return building;

  building = build().finally(() => {
    building = null;
  });
  return building;
}

async function build(): Promise<string | null> {
  const target = helperPath();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'goodbit-foreground-'));
  const script = path.join(dir, 'build.ps1');

  // `Add-Type` writes the assembly itself, so the C# never reaches a command
  // line, where its quoting would not survive.
  const build = [
    "$ErrorActionPreference = 'Stop'",
    `$source = @'\n${SOURCE}\n'@`,
    `Add-Type -TypeDefinition $source -OutputAssembly '${target}' -OutputType ConsoleApplication`,
  ].join('\n');

  try {
    writeFileSync(script, build, 'utf-8');
    await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 },
    );

    if (!existsSync(target)) throw new Error('Add-Type reported success and wrote nothing');
    writeFileSync(stampPath(), STAMP, 'utf-8');
    console.log(`[capture] built the foreground helper: ${target}`);
    return target;
  } catch (error) {
    console.warn(
      '[capture] could not build the foreground helper:',
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A temp file left behind is not worth reporting.
    }
  }
}
