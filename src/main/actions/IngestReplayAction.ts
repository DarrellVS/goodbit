/**
 * A replay lands in staging. Work out whose it is and file it.
 *
 * OBS cannot name a file after a game, so GoodBit does it. OBS
 * writes into `<videosRoot>/.goodbit-incoming/`, which it can do because
 * naming a folder after the clock is the one thing it *can* do, and GoodBit
 * renames the file into `<videosRoot>/<Game>/` once it knows the game.
 *
 * Two things here are not obvious and both are load bearing.
 *
 * **The rename is on the same volume, deliberately.** Staging sits inside the
 * videos root rather than in `%APPDATA%`, so this is an `fs.rename`: the file
 * either is not at its final path or is complete there. A cross volume copy of
 * a two hundred megabyte replay is not atomic, and an interrupted one leaves a
 * partial file at a path the library watcher will happily index.
 * `CheckObsSetupAction` already raises a blocker for exactly this condition.
 *
 * **The recording's own date survives the move.** A replay's mtime is when OBS
 * wrote it, which is right, and it has to stay right: taking the moment of the
 * move as the clip's date is the same bug `SyncClipCreationDatesAction` exists
 * to undo, and the one a trim already has to carry around.
 */
import { constants } from 'node:fs';
import { access, copyFile, mkdir, rename, stat, unlink, utimes } from 'node:fs/promises';
import path from 'node:path';
import { BaseAction } from './BaseAction.js';
import { VIDEOS_ROOT } from '../data-source.js';
import { loadSettings } from '../settings.js';
import { dominantBetween, samplesBetween } from '../services/capture/foregroundHistory.js';
import {
  gameForExecutable,
  isKnownGame,
  libraryFolders,
  UNSORTED,
  type GameGuess,
} from '../services/capture/gameNames.js';
import { probeDurationSec } from '../services/encoders.js';

export interface IngestReplayInput {
  filePath: string;
  /**
   * When the replay was saved, if anything knows.
   *
   * Phase 2 gets this from obs-websocket's `ReplayBufferSaved`, which is the
   * real press time. Without it the file's own mtime is the best available
   * answer and is only a few seconds late.
   */
  savedAt?: number;
}

export interface IngestReplayOutput {
  movedTo: string;
  game: string;
  source: GameGuess['source'];
}

/** A replay buffer nobody has configured is thirty seconds. */
const ASSUMED_BUFFER_SEC = 30;

export class IngestReplayAction extends BaseAction<IngestReplayInput, IngestReplayOutput> {
  async execute({ filePath, savedAt }: IngestReplayInput): Promise<IngestReplayOutput> {
    const info = await stat(filePath);
    const saved = savedAt ?? info.mtimeMs;

    // The window the clip actually covers: it ends when the buffer was saved
    // and begins a clip's length before that. A duration we cannot read falls
    // back to the usual buffer length rather than to a point in time, because
    // a point in time votes with one sample.
    const duration = (await probeDurationSec(filePath)) ?? ASSUMED_BUFFER_SEC;
    const settings = loadSettings();
    const existing = libraryFolders(VIDEOS_ROOT);

    const from = saved - duration * 1000;

    // Working out which executables are games is async and the vote is not, so
    // the set is filled for this window first. It is small: the distinct
    // programs somebody had in front during one clip.
    await primeCandidates(from, saved);

    const guess = dominantBetween(from, saved, (exePath) =>
      knownGames.has(exePath.toLowerCase()),
    );

    const named: GameGuess = guess
      ? await gameForExecutable(guess.exePath, existing, settings.gameOverrides ?? {})
      : { name: UNSORTED, source: 'none' };

    const target = await freePath(path.join(VIDEOS_ROOT, named.name), path.basename(filePath));
    await mkdir(path.dirname(target), { recursive: true });
    await moveAcross(filePath, target);
    await utimes(target, info.atime, info.mtime);

    console.log(
      `[capture] ${path.basename(filePath)} -> ${named.name}/ (${named.source}` +
        `${guess ? `, ${guess.samples}/${guess.total} samples` : ''})`,
    );

    return { movedTo: target, game: named.name, source: named.source };
  }
}

/**
 * Executables in a window that are games.
 *
 * Kept across calls because the answer for one executable never changes within
 * a session, and a user plays a handful of games.
 */
const knownGames = new Set<string>();
const checked = new Set<string>();

async function primeCandidates(from: number, to: number): Promise<void> {
  const seen = new Set(
    samplesBetween(from, to)
      .map((sample) => sample.exePath)
      .filter(Boolean),
  );

  for (const exePath of seen) {
    const key = exePath.toLowerCase();
    if (checked.has(key)) continue;
    checked.add(key);
    if (await isKnownGame(exePath)) knownGames.add(key);
  }
}

/** Never overwrite a clip that is already there, whatever OBS decided to call this one. */
async function freePath(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = path.join(dir, attempt === 0 ? name : `${stem} (${attempt})${ext}`);
    try {
      await access(candidate, constants.F_OK);
    } catch {
      return candidate;
    }
  }

  return path.join(dir, `${stem} (${Date.now()})${ext}`);
}

/**
 * A rename, or a copy when the rename cannot work.
 *
 * Staging is inside the videos root so this is a rename in every normal case.
 * The fallback exists for the one that is not: a user who moved their library
 * between the write and the move, where `EXDEV` is the only symptom.
 */
async function moveAcross(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await copyFile(from, to);
    await unlink(from);
  }
}
