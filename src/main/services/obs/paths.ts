import { existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Where OBS keeps its things, and whether it is running.
 *
 * All of this is Windows shaped, because the script the setup installs is
 * Windows only and says so on its own front page. The other platforms return
 * their real config directory anyway, so the reader can be tested anywhere.
 */

/** `%APPDATA%/obs-studio`, or the platform's equivalent. */
export function obsConfigDir(): string {
  if (process.env.GOODBIT_OBS_DIR) return process.env.GOODBIT_OBS_DIR;

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'obs-studio');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'obs-studio');
  }
  return path.join(os.homedir(), '.config', 'obs-studio');
}

export function profilesDir(): string {
  return path.join(obsConfigDir(), 'basic', 'profiles');
}

export function scenesDir(): string {
  return path.join(obsConfigDir(), 'basic', 'scenes');
}

/** Has OBS ever run here? Its configuration only exists after a first launch. */
export function obsHasConfig(): boolean {
  return existsSync(obsConfigDir()) && existsSync(path.join(obsConfigDir(), 'basic'));
}

/**
 * Is OBS on this machine at all?
 *
 * The configuration is not the test. OBS writes `%APPDATA%/obs-studio` the
 * first time it runs, so a machine where somebody has just clicked through the
 * installer has the program and none of the folders, and a setup that waits
 * for the folders leaves them staring at a disabled button telling them to
 * install what they just installed.
 *
 * The executable is the test. Everything this setup writes it creates itself.
 */
export async function obsIsInstalled(): Promise<boolean> {
  if (obsHasConfig()) return true;
  return (await findObsExecutable()) !== null;
}

const WINDOWS_EXE_CANDIDATES = [
  'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
  'C:\\Program Files (x86)\\obs-studio\\bin\\64bit\\obs64.exe',
];

/**
 * The executable, so the app can offer to start it.
 *
 * The install path is in the registry, but every install anyone has is in one
 * of two places and reading the registry costs a process launch, so the two
 * places are tried first.
 */
export async function findObsExecutable(): Promise<string | null> {
  if (process.platform !== 'win32') return null;

  for (const candidate of WINDOWS_EXE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const { stdout } = await run('reg', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OBS Studio',
      '/v',
      'InstallLocation',
    ]);
    const match = stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
    if (match) {
      const exe = path.join(match[1].trim(), 'bin', '64bit', 'obs64.exe');
      if (existsSync(exe)) return exe;
    }
  } catch {
    // No registry entry, a portable install, or not Windows.
  }

  return null;
}

/**
 * Is OBS running right now?
 *
 * This decides whether anything may be written at all. OBS parses its config
 * once into memory and rewrites the whole file from that model at every save
 * point, so an edit made while it runs is not merged, it is discarded at the
 * next profile switch or settings apply. Worse, a profile folder created while
 * it runs stays invisible until it restarts, because the profile list is a
 * cache refreshed at startup and by Import alone.
 */
export async function obsIsRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await run('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH']);
    return /obs64\.exe/i.test(stdout);
  } catch {
    // If the question cannot be answered, assume it is running: refusing to
    // write is recoverable, writing under OBS is not.
    return true;
  }
}

/** Directory names under `basic/profiles`, which are not the display names. */
export function profileFolders(): string[] {
  try {
    return readdirSync(profilesDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Scene collection files, by their base name. */
export function sceneCollectionFiles(): string[] {
  try {
    return readdirSync(scenesDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}
