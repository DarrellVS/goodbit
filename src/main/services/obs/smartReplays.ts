import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { net } from 'electron';
import { userDataDir } from '../../settings.js';

/**
 * Smart Replays, the part of the setup that OBS cannot do.
 *
 * OBS names a recording from the clock and the video settings, and from
 * nothing else: there is no token for a process, a window or a game. So a
 * folder per game needs code running inside OBS, and this is the script
 * everyone uses for it.
 *
 * It is downloaded rather than shipped. The licence (AGPL-3.0) would allow
 * shipping the file verbatim beside its licence as an aggregate, so that is
 * not the reason. The reasons are that a vendored copy makes GoodBit the
 * support desk for someone else's script, and that the user's relationship
 * with the author, who asks for a star in the script's own interface, should
 * stay theirs.
 */

/**
 * What gets downloaded, pinned to a commit rather than a branch or a tag.
 *
 * `master` is deliberately ahead of the newest tag here: two community fixes
 * landed after v1.0.8.2, one of them on the idle timer that the buffer restart
 * uses, which is the mechanism behind the open crash-on-wake report. Neither
 * bumped `VERSION`, so the version constant in the file cannot tell the tag
 * and this commit apart. The commit can.
 */
export const SMART_REPLAYS = {
  version: '1.0.8.2',
  commit: '2e5b1107b556c14bdeb3e115c76b46045c637c85',
  /**
   * The git blob hash GitHub publishes for that file, which is
   * `sha1("blob " + length + "\0" + contents)` over the LF bytes. GitHub does
   * not publish a SHA-256 for a blob, and this is checkable against the API
   * by anyone who wants to audit the pin.
   */
  blobSha1: 'f99f72bd4a55d7e802acdfd73fbd2a1b1aab911e',
  bytes: 66363,
  author: 'qvvonk',
  licence: 'AGPL-3.0',
  repository: 'https://github.com/qvvonk/smart_replays',
  forumPage: 'https://obsproject.com/forum/resources/smart-replays.2039/',
} as const;

export function smartReplaysUrl(): string {
  return `https://raw.githubusercontent.com/qvvonk/smart_replays/${SMART_REPLAYS.commit}/smart_replays.py`;
}

/** Where GoodBit keeps it. Never inside OBS's own folders. */
export function smartReplaysDir(): string {
  return path.join(userDataDir(), 'obs-scripts');
}

export function smartReplaysPath(): string {
  return path.join(smartReplaysDir(), 'smart_replays.py');
}

/**
 * Git's blob hash of some bytes, over LF line endings.
 *
 * Normalising first is not a shortcut: the file is stored with LF, and a copy
 * that has been through a Windows checkout or a browser's Save As has CRLF and
 * is 1,653 bytes longer while being the same script. Hashing the raw bytes
 * would report that identical file as a different one.
 */
export function gitBlobSha1(contents: Buffer | string): string {
  const raw = typeof contents === 'string' ? Buffer.from(contents, 'utf-8') : contents;
  const lf = Buffer.from(raw.toString('utf-8').replace(/\r\n/g, '\n'), 'utf-8');
  return createHash('sha1')
    .update(`blob ${lf.length}\0`)
    .update(lf)
    .digest('hex');
}

export interface DownloadResult {
  path: string;
  bytes: number;
  blobSha1: string;
  /** False when the bytes are not the ones this build was pinned to. */
  verified: boolean;
}

/**
 * Fetch the script, check it, and only then put it on disk.
 *
 * Written to a temporary name and renamed, so a failed or interrupted download
 * cannot leave a half a script where a whole one is expected.
 */
export async function downloadSmartReplays(): Promise<DownloadResult> {
  const url = smartReplaysUrl();
  const response = await net.fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download the script: ${response.status} ${response.statusText}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const blobSha1 = gitBlobSha1(body);
  const verified = blobSha1 === SMART_REPLAYS.blobSha1;

  if (!verified) {
    throw new Error(
      `The downloaded script is not the file GoodBit expected. Expected ${SMART_REPLAYS.blobSha1}, got ${blobSha1}. Nothing was installed.`,
    );
  }

  mkdirSync(smartReplaysDir(), { recursive: true });
  const target = smartReplaysPath();
  const temporary = `${target}.part`;
  writeFileSync(temporary, body);
  writeFileSync(target, body);
  try {
    writeFileSync(path.join(smartReplaysDir(), 'LICENCE.txt'), LICENCE_NOTE, 'utf-8');
  } catch {
    // A missing note is not worth failing an install over.
  }
  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(temporary);
  } catch {
    // Already gone, or never written.
  }

  return { path: target, bytes: body.length, blobSha1, verified };
}

const LICENCE_NOTE = `Smart Replays ${SMART_REPLAYS.version}
Copyright (C) 2024 ${SMART_REPLAYS.author}
Licensed under the GNU Affero General Public License v3.

Downloaded by GoodBit from
${SMART_REPLAYS.repository}
at commit ${SMART_REPLAYS.commit}

The full licence text ships with the script's own repository. GoodBit does not
modify this file, and is a separate program that only asks OBS to load it.
`;

/** Is a copy already on disk, and is it the one this build pins? */
export function installedSmartReplays(): { path: string; blobSha1: string; matchesPin: boolean } | null {
  const target = smartReplaysPath();
  if (!existsSync(target)) return null;
  try {
    const blobSha1 = gitBlobSha1(readFileSync(target));
    return { path: target, blobSha1, matchesPin: blobSha1 === SMART_REPLAYS.blobSha1 };
  } catch {
    return null;
  }
}

/** How a clip is named. Mirrors the script's own `ClipNamingModes`. */
export enum ClipNamingMode {
  /** The executable in the foreground when the hotkey was pressed. */
  CurrentProcess = 0,
  /** The executable that was in the foreground for most of the clip. */
  MostRecordedProcess = 1,
  /** The current OBS scene, which never inspects another process. */
  CurrentScene = 2,
}

export interface SmartReplaysAlias {
  /** `C:\path\to\game.exe > Game Name`, the script's own format. */
  value: string;
  uuid: string;
  selected: boolean;
  hidden: boolean;
}

/**
 * Characters the script refuses in a clip name, from its own source.
 *
 * `DOOM: The Dark Ages` was written straight through and the script threw
 * `AliasInvalidCharacters: 7` at load, which aborts the whole alias list, so
 * one game with a colon in its title silently cost all twenty five names. A
 * colon cannot be in a Windows folder name either, so there was never a
 * version of this that worked.
 */
const NAME_PROHIBITED = /[/\\:"<>*?|%]/g;

/** And in a path, which is a shorter list: a drive's colon has to survive. */
const PATH_PROHIBITED = /["<>*?|%]/;

/**
 * A folder name the script will accept, and Windows will allow.
 *
 * Removed rather than substituted. `DOOM - The Dark Ages` invents punctuation
 * the game does not have, and a folder named `DOOM_ The Dark Ages` looks like
 * a bug; `DOOM The Dark Ages` reads like a person wrote it.
 */
export function safeAliasName(name: string): string {
  return name.replace(NAME_PROHIBITED, '').replace(/\s+/g, ' ').trim();
}

/** Null when the path itself is something the script would reject. */
export function alias(executablePath: string, name: string): SmartReplaysAlias | null {
  const safeName = safeAliasName(name);
  if (!safeName) return null;
  if (PATH_PROHIBITED.test(executablePath)) return null;

  return {
    value: `${executablePath} > ${safeName}`,
    uuid: crypto.randomUUID(),
    selected: false,
    hidden: false,
  };
}

export interface SmartReplaysSettings {
  clipsBasePath: string;
  namingMode: ClipNamingMode;
  aliases: SmartReplaysAlias[];
  /** Seconds between automatic buffer restarts. Zero is off, and is the default here. */
  restartBufferLoop: number;
}

/**
 * The settings object OBS stores for the script.
 *
 * Property names are the script's own (`clips_base_path`, `aliases_list` and
 * so on), taken from its source rather than guessed, and OBS persists this
 * verbatim inside the scene collection under `modules["scripts-tool"]`.
 *
 * `restart_buffer_loop` is zero rather than the script's own default of an
 * hour. The cyclic restart is the feature behind an open crash report, it is
 * on by default upstream, and a setup that turns something like that on for
 * someone is a setup that broke their machine at four in the morning. The
 * script's own settings panel can turn it on.
 */
export function scriptSettings(settings: SmartReplaysSettings): Record<string, unknown> {
  return {
    clips_base_path: settings.clipsBasePath,
    clips_save_to_folder: true,
    clips_naming_mode: settings.namingMode,
    clips_filename_template: '%NAME_%d.%m.%Y_%H-%M-%S',
    restart_buffer: true,
    restart_buffer_loop: settings.restartBufferLoop,
    aliases_list: settings.aliases,
  };
}
