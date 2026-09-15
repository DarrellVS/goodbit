import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { net } from 'electron';
import { userDataDir } from '../../settings.js';

const run = promisify(execFile);

/**
 * The Python GoodBit brings with it.
 *
 * OBS will not run a script until it has been pointed at an installation, and
 * the script this setup installs needs Tkinter for its notifications. Both of
 * those are easy to satisfy badly:
 *
 * **Newest is not best.** OBS's Python plugin is built against a particular C
 * API, and a version past the one it knows fails to load with nothing but a
 * line in a log file:
 *
 *     [Python] Could not load library: C:/Python313/
 *
 * The DLL is right there; OBS simply cannot use it. Nothing in OBS's own
 * interface says so, and the only symptom is that clips stop being sorted.
 *
 * So GoodBit does not gamble on whatever a machine happens to have. It
 * installs **its own 3.11** into its own folder and points OBS at that, and
 * the versions already on the machine are only ever read to explain a
 * situation, never depended on. That keeps this working on a machine with no
 * Python, a machine whose Python is too new, and a machine whose Python gets
 * upgraded next Tuesday by something else entirely.
 */

export interface PythonInstall {
  /** The directory OBS wants, not the executable. */
  directory: string;
  executable: string;
  version: string;
  major: number;
  minor: number;
  /** Without this the script loads but its notifications never appear. */
  hasTkinter: boolean;
  /** In range, with Tkinter: something OBS will load and the script will use. */
  usable: boolean;
  /** Set when this is a fine Python that OBS cannot load. */
  tooNew: boolean;
  /** GoodBit installed this one itself, into its own folder. */
  private: boolean;
}

const MIN_MINOR = 10;

/**
 * The newest minor OBS's scripting plugin loads.
 *
 * 3.13 is proven not to on OBS 31: the library is found and refused. Raise
 * this when a version of OBS ships that handles it, not before.
 */
const MAX_MINOR = 12;

/** The one to reach for first, because it is the one known to work here. */
const PREFERRED_MINOR = 11;

/** Where a Python of GoodBit's own lives. Never on the PATH, never shared. */
export function privatePythonDir(): string {
  return path.join(userDataDir(), 'python');
}

async function describe(executable: string, isPrivate = false): Promise<PythonInstall | null> {
  try {
    const { stdout } = await run(executable, [
      '-c',
      // One process for both questions. Importing tkinter is the only honest
      // test of it: a Python built without tcl/tk imports everything else fine.
      'import sys;\ntry:\n import tkinter; tk = 1\nexcept Exception:\n tk = 0\nprint(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}|{tk}|{sys.prefix}")',
    ]);

    const [version, tk, prefix] = stdout.trim().split('|');
    const [major, minor] = version.split('.').map(Number);
    const hasTkinter = tk === '1';
    const tooNew = major > 3 || (major === 3 && minor > MAX_MINOR);
    const inRange = major === 3 && minor >= MIN_MINOR && minor <= MAX_MINOR;

    return {
      directory: prefix,
      executable,
      version,
      major,
      minor,
      hasTkinter,
      usable: inRange && hasTkinter,
      tooNew,
      private: isPrivate,
    };
  } catch {
    return null;
  }
}

/**
 * Every Python worth trying, best first.
 *
 * GoodBit's own comes first when it exists, because it is the one version this
 * app knows OBS can load. Then the `py` launcher, which is the only thing that
 * can list every registered install, then the usual install locations, then
 * whatever is on the PATH. Windows provides a stub for `python` that opens the
 * Store, which is why the version is checked rather than the exit code.
 */
export async function findPython(): Promise<PythonInstall[]> {
  if (process.platform !== 'win32') {
    const found = await describe('python3');
    return found ? [found] : [];
  }

  const installs: PythonInstall[] = [];
  const seen = new Set<string>();

  const consider = async (executable: string, isPrivate = false): Promise<void> => {
    const key = executable.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const found = await describe(executable, isPrivate);
    if (!found) return;
    if (installs.some((install) => install.directory.toLowerCase() === found.directory.toLowerCase())) {
      return;
    }
    installs.push(found);
  };

  const ours = path.join(privatePythonDir(), 'python.exe');
  if (existsSync(ours)) await consider(ours, true);

  const candidates: string[] = [];

  try {
    const { stdout } = await run('py', ['-0p']);
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/([A-Za-z]:\\[^\s].*python\.exe)/i);
      if (match) candidates.push(match[1]);
    }
  } catch {
    // No launcher installed, which is common enough.
  }

  const localPrograms = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python');
  if (process.env.LOCALAPPDATA && existsSync(localPrograms)) {
    for (const minor of [12, 11, 10, 13]) {
      const guess = path.join(localPrograms, `Python3${minor}`, 'python.exe');
      if (existsSync(guess)) candidates.push(guess);
    }
  }
  for (const minor of [12, 11, 10, 13]) {
    const guess = `C:\\Python3${minor}\\python.exe`;
    if (existsSync(guess)) candidates.push(guess);
  }

  candidates.push('python');

  for (const candidate of candidates) await consider(candidate);

  // 3.11 first among equals: it is the line known to load here. Then the rest
  // of the accepted range, newest first, then anything else so the UI can
  // explain why it was not chosen.
  const rank = (install: PythonInstall): number => {
    if (!install.usable) return -1000;
    if (install.minor === PREFERRED_MINOR) return 1000;
    return install.minor;
  };

  return installs.sort((a, b) => {
    const difference = rank(b) - rank(a);
    if (difference !== 0) return difference;
    if (a.private !== b.private) return a.private ? -1 : 1;
    return 0;
  });
}

/**
 * GoodBit's own, if it is installed.
 *
 * Deliberately not "the best one on the machine". A system Python is somebody
 * else's to upgrade, uninstall or replace with a version OBS cannot load, and
 * when that happens the only sign is clips landing in the wrong folder.
 */
export function ownPython(): Promise<PythonInstall | null> {
  const executable = path.join(privatePythonDir(), 'python.exe');
  if (!existsSync(executable)) return Promise.resolve(null);
  return describe(executable, true);
}

/**
 * Make sure there is one, installing it if not.
 *
 * Idempotent: an install that is already there and runs is returned as is, so
 * this can be called on every apply without downloading anything.
 */
export async function ensureOwnPython(
  onProgress: (progress: PythonInstallProgress) => void,
): Promise<PythonInstall> {
  const existing = await ownPython();
  if (existing?.usable) return existing;
  return installPrivatePython(onProgress);
}

/**
 * The best one on the machine, for saying what is there.
 *
 * Used by the diagnostic to explain why an existing setup is not working, and
 * by nothing that writes.
 */
export async function bestPython(): Promise<PythonInstall | null> {
  const installs = await findPython();
  return installs.find((install) => install.usable) ?? installs[0] ?? null;
}

/**
 * Is the Python OBS is already pointed at fine as it is?
 *
 * This decides whether the setup touches that setting at all. Replacing a
 * working path with a different working path is churn; replacing a working
 * path with a newer Python that OBS cannot load, which is what happened here
 * once, is a regression the user then has to diagnose from an OBS log.
 */
export async function pythonAtPathIsUsable(directory: string | null): Promise<boolean> {
  if (!directory) return false;
  const executable = path.join(directory.replace(/\//g, path.sep), 'python.exe');
  if (!existsSync(executable)) return false;
  const found = await describe(executable);
  return found?.usable === true;
}

/** Where to send someone who wants to install it themselves. */
export const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/windows/';

/**
 * The versions GoodBit is willing to install, newest first.
 *
 * More than one because of how the installer behaves. Its bootstrapper treats
 * an existing install of the same minor as a **related bundle** and upgrades
 * that one in place, ignoring `TargetDir` entirely: asked for a private 3.11.9
 * on a machine with 3.11.4, it upgraded the user's own installation and left
 * the private folder empty. The only reliable way to get a copy of our own is
 * to pick a minor version the machine does not already have.
 *
 * All of these are inside the range OBS loads, 3.10 to 3.12, and all ship a
 * Windows installer with Tkinter, which the script needs at import time.
 */
const PRIVATE_PYTHONS = [
  { version: '3.12.8', url: 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' },
  { version: '3.11.9', url: 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' },
  { version: '3.10.11', url: 'https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe' },
] as const;

/** Which of them will not collide with something already installed. */
async function pickPrivateVersion(): Promise<(typeof PRIVATE_PYTHONS)[number] | null> {
  const present = new Set((await findPython()).map((install) => `${install.major}.${install.minor}`));
  return (
    PRIVATE_PYTHONS.find((candidate) => !present.has(candidate.version.split('.').slice(0, 2).join('.'))) ??
    null
  );
}

export type PythonInstallProgress =
  | { stage: 'downloading'; percent: number }
  | { stage: 'verifying' }
  | { stage: 'installing' }
  | { stage: 'done'; directory: string };

/**
 * Is this file really from python.org?
 *
 * There is no published hash this build could have been pinned to without
 * fetching it from the same place as the file, which proves nothing. The
 * installer is Authenticode signed, so ask Windows whether the signature is
 * valid and who signed it. An unsigned or wrongly signed file is not run.
 */
async function signedByPython(file: string): Promise<{ ok: boolean; signer: string }> {
  try {
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`,
      ],
      { windowsHide: true, timeout: 30_000 },
    );

    const [status, subject = ''] = stdout.trim().split('|');
    return {
      ok: status === 'Valid' && /Python Software Foundation/i.test(subject),
      signer: subject.trim(),
    };
  } catch {
    return { ok: false, signer: '' };
  }
}

/**
 * Install a Python of GoodBit's own, into GoodBit's own folder.
 *
 * Per-user, so it needs no administrator; into `%APPDATA%/GoodBit/python`, so
 * it is not on the PATH, is not registered, is not associated with `.py`, and
 * takes nothing over. The only thing it is for is letting OBS run one script.
 *
 * The flags are the documented quiet-install set. `Include_tcltk=1` is the one
 * that matters: without it the script loads and its notifications never work.
 */
export async function installPrivatePython(
  onProgress: (progress: PythonInstallProgress) => void,
): Promise<PythonInstall> {
  const choice = await pickPrivateVersion();
  if (!choice) {
    /*
     * Every version we would install is already here.
     *
     * Installing anyway would upgrade one of theirs, which is the thing this
     * is avoiding. A usable one on the machine is the better outcome than
     * damaging it for the sake of owning the copy.
     */
    const existing = (await findPython()).find((install) => install.usable);
    if (existing) return existing;
    throw new Error(
      'Python 3.10, 3.11 and 3.12 are all installed here, and none of them can run the script. Repair one of them, or remove one so GoodBit can install its own.',
    );
  }

  const target = privatePythonDir();
  const scratch = path.join(os.tmpdir(), `goodbit-python-${Date.now()}`);
  mkdirSync(scratch, { recursive: true });
  const installer = path.join(scratch, `python-${choice.version}-amd64.exe`);

  try {
    const response = await net.fetch(choice.url);
    if (!response.ok || !response.body) {
      throw new Error(`Could not download Python: ${response.status} ${response.statusText}`);
    }

    const total = Number(response.headers.get('content-length')) || 0;
    const chunks: Buffer[] = [];
    let received = 0;

    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(Buffer.from(value));
      received += value.length;
      onProgress({
        stage: 'downloading',
        percent: total ? Math.round((received / total) * 100) : 0,
      });
    }

    writeFileSync(installer, Buffer.concat(chunks));

    onProgress({ stage: 'verifying' });
    const signature = await signedByPython(installer);
    if (!signature.ok) {
      throw new Error(
        `That download is not signed by the Python Software Foundation${
          signature.signer ? ` (signed by ${signature.signer})` : ''
        }, so it was not run.`,
      );
    }

    onProgress({ stage: 'installing' });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        installer,
        [
          '/quiet',
          'InstallAllUsers=0',
          `TargetDir=${target}`,
          'Include_tcltk=1',
          'Include_launcher=0',
          'Include_test=0',
          'Include_doc=0',
          'AssociateFiles=0',
          'Shortcuts=0',
          'PrependPath=0',
          'CompileAll=0',
        ],
        { windowsHide: true },
      );
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`The Python installer stopped with code ${code}.`));
      });
    });

    /*
     * Wait for it to actually be there.
     *
     * The bootstrapper exits while msiexec is still writing files, so asking
     * the moment it returns found no python.exe and reported "Python was
     * installed but could not be run afterwards", which was true and useless.
     */
    const installed = await waitForPython(target, 90_000);
    if (!installed) {
      throw new Error(
        `Python ${choice.version} was installed but nothing appeared in ${target}. Its installer may have updated an existing copy instead.`,
      );
    }

    onProgress({ stage: 'done', directory: installed.directory });
    return installed;
  } finally {
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      // A leftover installer in the temp folder is not worth reporting.
    }
  }
}

/** Poll for the interpreter, since the installer returns before it exists. */
async function waitForPython(target: string, timeoutMs: number): Promise<PythonInstall | null> {
  const executable = path.join(target, 'python.exe');
  const until = Date.now() + timeoutMs;

  for (;;) {
    if (existsSync(executable)) {
      const found = await describe(executable, true);
      if (found) return found;
    }
    if (Date.now() > until) return null;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
