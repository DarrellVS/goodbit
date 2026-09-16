/**
 * Does a global hotkey survive an elevated window having focus?
 *
 * This decides something real. OBS does not use `RegisterHotKey`: a libobs
 * thread polls `GetAsyncKeyState` every 25 ms (`libobs/obs-windows.c`), and
 * `GetAsyncKeyState` is UIPI filtered, its own reference page says so. When a
 * game, a launcher or an anti-cheat holds the foreground at high integrity,
 * every poll reads zero and `vk_down` cannot tell "not pressed" from "not
 * allowed to look". That is the real reason "run OBS as administrator" fixes
 * dead replay hotkeys, and it is the complaint users hit most.
 *
 * Electron's `globalShortcut` is `RegisterHotKey` underneath
 * (`ui/gfx/win/singleton_hwnd_hot_key_observer.cc`). `RegisterHotKey` appears
 * on no documented UIPI blocklist, and the kernel posts `WM_HOTKEY` to the
 * registering thread's own queue rather than sending anything across
 * processes, so by mechanism it should fire whatever has focus. The
 * AutoHotkey FAQ implies otherwise and is not specific enough to settle it.
 *
 * Nothing in Microsoft's documentation answers this either way, so measure it.
 *
 *   npx electron scripts/hotkey-check.mjs
 *
 * Then, without closing it:
 *
 *   1. Press F9 with this console focused. It should count.
 *   2. Open Task Manager (Ctrl+Shift+Esc). It runs at high integrity for an
 *      administrator, with no consent prompt. Click it, press F9.
 *   3. Open anything genuinely elevated, a terminal started with "Run as
 *      administrator", click it, press F9.
 *
 * If step 2 and step 3 count, GoodBit can own the replay key without asking
 * anyone to run it as administrator, which is strictly better than OBS.
 */
import { app, globalShortcut } from 'electron';
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEYS = ['F9', 'F8'];
const counts = new Map(KEYS.map((key) => [key, 0]));

/*
 * Electron's main process does not reliably reach a piped stdout on Windows,
 * so every line goes to a file as well. Read it afterwards if the console
 * came up empty.
 */
const LOG = join(process.cwd(), 'hotkey-check.log');

function say(line) {
  console.log(line);
  try {
    appendFileSync(LOG, `${line}\n`);
  } catch {
    // A log we cannot write is not a reason to fail the test.
  }
}

/**
 * What had focus when the key fired, and whether we can even see it.
 *
 * This is the whole point of the test, and it was being left to whoever
 * pressed the key to keep track of. A press with this console in front proves
 * nothing; a press with Task Manager in front is the answer. Printing it turns
 * "which window was that?" into a line you can read back.
 *
 * **"denied" is itself a result.** `Get-Process` on a process at higher
 * integrity than ours is refused, so a window we cannot name is a window more
 * privileged than this one, which is exactly the case being tested. If the key
 * still fired, `RegisterHotKey` reached across an integrity boundary that
 * `GetAsyncKeyState`, and therefore OBS, cannot.
 *
 * Written to a file and run with `-File` rather than passed with `-Command`.
 * The script needs both kinds of quote for its `DllImport` attributes, and
 * threading those through a JavaScript string, `execFile`, and PowerShell's own
 * parser is three chances to get it wrong. It was wrong the first time.
 */
const PROBE = join(process.cwd(), 'tmp', 'foreground-probe.ps1');

function writeProbe() {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  writeFileSync(
    PROBE,
    [
      'Add-Type -Namespace W -Name N -MemberDefinition @"',
      '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);',
      '"@',
      '$p = 0',
      '[void][W.N]::GetWindowThreadProcessId([W.N]::GetForegroundWindow(), [ref]$p)',
      'try { (Get-Process -Id $p -ErrorAction Stop).ProcessName }',
      'catch { "denied (a window more privileged than this one)" }',
      '',
    ].join('\n'),
    'utf-8',
  );
}

function foreground() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PROBE],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => resolve(error ? 'unknown' : stdout.trim() || 'unknown'),
    );
  });
}

/** Are we the thing with the privilege, which would make the test meaningless? */
function elevated() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent())' +
          '.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
      ],
      (error, stdout) => resolve(!error && stdout.trim().toLowerCase() === 'true'),
    );
  });
}

app.whenReady().then(async () => {
  writeProbe();
  const admin = await elevated();

  say('');
  say(`  Running elevated: ${admin ? 'YES, so this test proves nothing' : 'no, good'}`);
  say('');

  for (const key of KEYS) {
    const ok = globalShortcut.register(key, () => {
      const next = counts.get(key) + 1;
      counts.set(key, next);
      // Which window was in front is the entire measurement, so it is printed
      // rather than left to whoever is pressing the key to remember.
      void foreground().then((where) =>
        say(`  ${key} fired  (${next})  ${new Date().toLocaleTimeString()}   in front: ${where}`),
      );
    });

    // `register` returns false when another program already owns the
    // accelerator, silently, because that is what `RegisterHotKey` does.
    say(`  ${key}: ${ok ? 'registered' : 'REFUSED, something else owns it'}`);
  }

  say('');
  say('  Now focus an elevated window and press F9. Ctrl+C to stop.');
  say('');
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// No window at all: the question is whether this works with nothing focused.
app.on('window-all-closed', () => {});
