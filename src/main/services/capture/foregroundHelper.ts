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

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

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
