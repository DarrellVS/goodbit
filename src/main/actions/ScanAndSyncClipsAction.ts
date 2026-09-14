import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';

export type ScanResult = {
  added: number;
  updated: number;
  removed: number;
  total: number;
  /**
   * Set when pruning was refused because the folder looked wrong rather than
   * emptied. The rows are left alone and the reason is passed up.
   */
  pruneSkipped?: { reason: string; wouldHaveRemoved: number };
};

/**
 * How much of the library may disappear in a single scan before it is treated
 * as a problem with the folder rather than as deletions.
 *
 * A clip row carries everything that cannot be recovered from disk, tags,
 * notes, the display name, collection membership, stars. Losing half of them in
 * one pass is never something the user did by hand; it means the videos folder
 * is pointed somewhere wrong, or an external drive has not mounted yet.
 */
const MAX_PRUNE_FRACTION = 0.5;

function toRelPath(absolutePath: string): string {
  return path.relative(VIDEOS_ROOT, absolutePath);
}

export class ScanAndSyncClipsAction extends BaseAction<void, ScanResult> {
  async execute(): Promise<ScanResult> {
    const clipRepo = AppDataSource.getRepository(Clip);
    const gameRepo = AppDataSource.getRepository(Game);

    const patterns = ['*/*.mp4', '*/*.mov', '*/*.MP4', '*/*.MOV'];
    const entries = await fg(patterns, {
      cwd: VIDEOS_ROOT,
      onlyFiles: true,
      dot: false,
      unique: true,
      followSymbolicLinks: true,
      absolute: true,
    });

    const nowOnDisk = new Set<string>();
    const gamesFound = new Set<string>();
    let added = 0;
    let updated = 0;

    for (const absPath of entries) {
      nowOnDisk.add(absPath);
      const rel = toRelPath(absPath);
      const game = rel.split(path.sep)[0] || '';
      gamesFound.add(game);
      const filename = path.basename(absPath);
      const extension = path.extname(filename).slice(1);
      const stat = await fs.stat(absPath);

      const existing = await clipRepo.findOne({ where: { filePath: absPath } });
      if (!existing) {
        const clip = clipRepo.create({
          filePath: absPath,
          relPath: rel,
          game,
          filename,
          extension,
          sizeBytes: stat.size,
          fileModifiedAt: stat.mtime,
          displayName: null,
        });
        await clipRepo.save(clip);
        added += 1;
      } else {
        if (
          existing.sizeBytes !== stat.size ||
          new Date(existing.fileModifiedAt).getTime() !== stat.mtime.getTime() ||
          existing.relPath !== rel ||
          existing.filename !== filename ||
          existing.extension !== extension ||
          existing.game !== game
        ) {
          existing.sizeBytes = stat.size;
          existing.fileModifiedAt = stat.mtime;
          existing.relPath = rel;
          existing.filename = filename;
          existing.extension = extension;
          existing.game = game;
          await clipRepo.save(existing);
          updated += 1;
        }
      }
    }

    const allClips = await clipRepo.find();
    const missing = allClips.filter((clip) => !nowOnDisk.has(clip.filePath));

    // Deleting a clip row throws away the only copy of its tags, notes, display
    // name, collections and stars. When the videos folder is momentarily
    // unreachable, an external drive not mounted yet, or a first-run picker
    // pointed at the wrong place. Every file looks missing at once, and the
    // unguarded version of this loop wiped the whole library.
    let pruneSkipped: ScanResult['pruneSkipped'];
    const wipingEverything = entries.length === 0 && allClips.length > 0;
    const wipingMost =
      allClips.length > 0 && missing.length / allClips.length > MAX_PRUNE_FRACTION;

    if (wipingEverything || wipingMost) {
      pruneSkipped = {
        reason: wipingEverything
          ? 'the videos folder looks empty or unreachable'
          : `this scan would have removed ${missing.length} of ${allClips.length} clips`,
        wouldHaveRemoved: missing.length,
      };
      console.warn(
        `[scan] not removing anything, ${pruneSkipped.reason}. ` +
          'Check the videos folder in Settings; nothing has been deleted.',
      );
    }

    let removed = 0;
    if (!pruneSkipped) {
      for (const clip of missing) {
        await clipRepo.remove(clip);
        removed += 1;
      }
    }

    // Sync games table - create Game entries for any new games found
    for (const gameName of gamesFound) {
      if (gameName) {
        const existingGame = await gameRepo.findOne({ where: { name: gameName } });
        if (!existingGame) {
          const newGame = gameRepo.create({
            name: gameName,
            displayName: null,
          });
          await gameRepo.save(newGame);
        }
      }
    }

    const total = await clipRepo.count();
    return { added, updated, removed, total, pruneSkipped };
  }
}


