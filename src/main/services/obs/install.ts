import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { net, shell } from 'electron';

const run = promisify(execFile);

/**
 * Getting OBS onto a machine that does not have it.
 *
 * GoodBit is a companion to OBS: with no OBS there are no clips, and the app
 * is an empty library with a folder picker. Sending someone to a website in
 * the middle of that is where most of them stop, so the first run offers to
 * fetch it.
 *
 * Two routes, and neither of them installs anything behind the user's back:
 *
 * - **winget**, which is on every Windows 11 and most Windows 10 machines. It
 *   is Microsoft's own package manager, it verifies the package, and it is a
 *   single command with visible progress.
 * - **The official installer**, downloaded from the obsproject organisation's
 *   own GitHub release and then opened. OBS's installer appears, with its own
 *   licence page and its own choices, and a person clicks through it.
 *
 * What is deliberately not here is a silent install. An application that
 * quietly installs other applications is not a convenience.
 */

export const OBS_DOWNLOAD_PAGE = 'https://obsproject.com/download';
const OBS_RELEASES_API = 'https://api.github.com/repos/obsproject/obs-studio/releases/latest';
const WINGET_ID = 'OBSProject.OBSStudio';

export interface ObsInstallOption {
  method: 'winget' | 'download' | 'manual';
  /** What to say on the button. */
  label: string;
  detail: string;
}

/** Is winget on this machine, and usable? */
export async function hasWinget(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    await run('winget', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Which version winget would install, if it is even here.
 *
 * Worth knowing because it is often not the current one: winget's manifests
 * are a separate repository with its own pace, and it offered 32.2.1 on a day
 * OBS had already shipped 32.2.2. Somebody who has just been walked through
 * installing OBS should not be met by its updater a minute later.
 */
export async function wingetVersion(): Promise<string | null> {
  if (!(await hasWinget())) return null;
  try {
    const { stdout } = await run('winget', ['show', '--id', WINGET_ID, '--exact'], {
      windowsHide: true,
      timeout: 20_000,
    });
    return stdout.match(/^Version:\s*(.+)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function installOptions(): Promise<ObsInstallOption[]> {
  if (process.platform !== 'win32') {
    return [{ method: 'manual', label: 'Open the download page', detail: OBS_DOWNLOAD_PAGE }];
  }

  /*
   * The installer first.
   *
   * It comes from the OBS project's own release, so it is always the current
   * version, and it asks for elevation itself rather than failing when a file
   * is in use. winget is a fine second: one command, no clicking through, and
   * whatever version its manifest has caught up to.
   */
  const options: ObsInstallOption[] = [
    {
      method: 'download',
      label: 'Install OBS',
      detail:
        "The official installer from the OBS project's own release. Windows asks for permission; nothing else to click.",
    },
  ];

  const version = await wingetVersion();
  if (version) {
    options.push({
      method: 'winget',
      label: `Use winget instead (${version})`,
      detail: `Installs ${WINGET_ID} with Windows' own package manager, without a window to click through`,
    });
  }

  options.push({ method: 'manual', label: 'Open the download page', detail: OBS_DOWNLOAD_PAGE });
  return options;
}

export interface ObsInstallerAsset {
  version: string;
  name: string;
  url: string;
  bytes: number;
}

/**
 * The latest Windows installer, from OBS's own releases.
 *
 * Asked for at the moment it is needed rather than pinned, because pinning a
 * version means shipping a link to an old OBS forever, and the publisher here
 * is the OBS project's own repository rather than a mirror.
 */
export async function latestInstaller(): Promise<ObsInstallerAsset> {
  const response = await net.fetch(OBS_RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'GoodBit' },
  });
  if (!response.ok) {
    throw new Error(`Could not ask GitHub for the latest OBS: ${response.status}`);
  }

  const release = (await response.json()) as {
    tag_name?: string;
    assets?: Array<{ name: string; browser_download_url: string; size: number }>;
  };

  /*
   * Matched loosely, because the name carries an architecture in the middle:
   *
   *   OBS-Studio-32.2.2-Windows-x64-Installer.exe
   *
   * A pattern anchored on `Windows-Installer.exe` matched nothing, and the
   * error said the release had no Windows installer, which was a lie about
   * OBS rather than about the pattern. Architecture is picked explicitly, x64
   * first, because arm64 ships as a zip and is not an installer at all.
   */
  const windowsInstallers = (release.assets ?? []).filter(
    (candidate) =>
      /windows/i.test(candidate.name) &&
      /installer/i.test(candidate.name) &&
      candidate.name.toLowerCase().endsWith('.exe') &&
      !/arm/i.test(candidate.name),
  );

  const asset =
    windowsInstallers.find((candidate) => /x64|amd64/i.test(candidate.name)) ?? windowsInstallers[0];

  if (!asset) {
    throw new Error(
      `OBS ${release.tag_name ?? ''} has no Windows installer among its ${
        (release.assets ?? []).length
      } files. Use the download page instead.`,
    );
  }

  // The download must come from GitHub's own host. A release JSON is data from
  // the internet, and following an arbitrary URL out of it to something this
  // app then executes is exactly the shape to refuse.
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || !/(^|\.)github\.com$/.test(url.hostname)) {
    throw new Error(`Refusing to download OBS from ${url.hostname}.`);
  }

  return {
    version: (release.tag_name ?? '').replace(/^v/, ''),
    name: asset.name,
    url: asset.browser_download_url,
    bytes: asset.size,
  };
}

export type InstallProgress =
  | { stage: 'downloading'; percent: number; bytes: number; totalBytes: number }
  | { stage: 'running'; message: string }
  | { stage: 'done'; message: string }
  | { stage: 'failed'; message: string };

/**
 * Download the installer and hand it to the user.
 *
 * `shell.openPath` rather than spawning it with silent flags: the OBS
 * installer's own window is the consent, and it is also the only thing that
 * can answer the questions it asks.
 */
export async function downloadAndRunInstaller(
  onProgress: (progress: InstallProgress) => void,
): Promise<string> {
  const asset = await latestInstaller();
  const response = await net.fetch(asset.url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const totalBytes = Number(response.headers.get('content-length')) || asset.bytes;
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
      percent: totalBytes ? Math.round((received / totalBytes) * 100) : 0,
      bytes: received,
      totalBytes,
    });
  }

  const dir = path.join(os.tmpdir(), 'goodbit-obs-installer');
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, asset.name);
  writeFileSync(target, Buffer.concat(chunks));

  /*
   * Run it with `/S`, which is NSIS's silent switch.
   *
   * Not silent as in hidden: Windows still asks for elevation, in its own
   * dialog, and this app said what it was about to do before downloading
   * anything. Silent as in no eleven-step wizard, and crucially no "Launch OBS
   * Studio now" tickbox at the end. That tickbox is what made the OBS
   * auto-configuration wizard appear: OBS started before GoodBit had written
   * anything, and its wizard only ever runs on a first launch.
   */
  onProgress({ stage: 'running', message: `Installing OBS ${asset.version}` });

  const installed = await new Promise<boolean>((resolve) => {
    const child = spawn(target, ['/S'], { windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });

  if (!installed) {
    // Elevation refused, or a machine that will not run it unattended. Hand
    // the file over instead of failing: its own window works.
    onProgress({ stage: 'running', message: `Opening ${asset.name}` });
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    onProgress({ stage: 'done', message: `OBS ${asset.version} installer opened` });
    return target;
  }

  onProgress({ stage: 'done', message: `OBS ${asset.version} installed` });
  return target;
}

/**
 * What winget's exit codes mean, for the ones that happen.
 *
 * It reports failures as a 32 bit code and nothing else, so an installer that
 * cannot write to its own folder surfaced as "winget stopped with code
 * 2316632337". That number is 0x8A150111, and the one that produced it here
 * was a file in `C:\Program Files\obs-studio` held open by Chrome and Slack:
 * both load the OBS virtual camera DLL at startup to enumerate cameras, and
 * the installer cannot replace a file somebody else has open.
 *
 * Only the ones worth telling a person about. Anything else falls back to the
 * code, which at least searches.
 */
const WINGET_ERRORS: Record<number, string> = {
  // The CLI range, 0x8A1500xx.
  0x8a150010: 'winget has no installer for this machine.',
  0x8a150011: 'The download did not match the hash winget expected, so it was refused.',
  0x8a150014: 'winget could not find that package.',
  0x8a150019: 'That needs an administrator.',
  0x8a15002b:
    'winget thinks OBS is already installed and has nothing newer to offer, which is what a leftover uninstall entry looks like. The installer route below works regardless.',
  // The install range, 0x8A1501xx.
  0x8a150101: 'OBS is running. Close it and try again.',
  0x8a150102: 'Another install is already running. Let that finish first.',
  0x8a150103:
    'A file OBS installs is open in another program. Chrome, Slack and Discord all load the OBS virtual camera at startup.',
  0x8a150105: 'There is not enough disk space.',
  0x8a150107: 'winget could not reach the internet.',
  0x8a150109: 'OBS installed, but Windows wants a restart to finish it.',
  0x8a15010c: 'The install was cancelled.',
  0x8a15010d: 'winget says OBS is already installed.',
  0x8a15010f: 'A policy on this machine blocks installing it this way.',
  0x8a150111:
    'A file OBS installs is in use by another program. Chrome, Slack and Discord all load the OBS virtual camera at startup.',
  0x8a150113: 'winget says this package does not support this version of Windows.',
};

/** Failures where the official installer is likely to succeed instead. */
const WINGET_TRY_INSTALLER = new Set([0x8a15002b, 0x8a150103, 0x8a150111, 0x8a150019, 0x8a15010d]);

function unsignedCode(code: number | null): number | null {
  if (code === null) return null;
  // Exit codes arrive as a signed 32 bit integer, so 0x8A150111 comes back
  // negative, and the same failure printed two different ways is worse than
  // useless to somebody searching for it.
  return code < 0 ? code + 0x1_0000_0000 : code;
}

function wingetMessage(code: number | null): string {
  const unsigned = unsignedCode(code);
  if (unsigned === null) return 'winget stopped without saying why.';
  const known = WINGET_ERRORS[unsigned];
  const hex = `0x${unsigned.toString(16).toUpperCase()}`;
  return known ? `${known} (winget ${hex})` : `winget stopped with ${hex}.`;
}

/** Worth trying the installer after this one? */
export function wingetWorthRetrying(message: string): boolean {
  const match = message.match(/0x([0-9A-F]{8})/i);
  if (!match) return false;
  return WINGET_TRY_INSTALLER.has(Number.parseInt(match[1], 16));
}

/**
 * Install through winget, reporting its output as it goes.
 *
 * The agreement flags are the two that block an unattended run and nothing
 * else; the package itself is named explicitly and exactly, so there is no
 * search step that could resolve to something else.
 */
export function installWithWinget(onProgress: (progress: InstallProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'winget',
      [
        'install',
        '--exact',
        '--id',
        WINGET_ID,
        '--accept-source-agreements',
        '--accept-package-agreements',
      ],
      { windowsHide: true },
    );

    const say = (data: Buffer): void => {
      const message = data.toString().replace(/\r/g, '').trim();
      if (message) onProgress({ stage: 'running', message: message.split('\n').pop() ?? message });
    };

    child.stdout?.on('data', say);
    child.stderr?.on('data', say);

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        onProgress({ stage: 'done', message: 'OBS installed' });
        resolve();
        return;
      }
      reject(new Error(wingetMessage(code)));
    });
  });
}
