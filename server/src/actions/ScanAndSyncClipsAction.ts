import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';

export type ScanResult = { added: number; updated: number; removed: number; total: number };

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
    let removed = 0;
    for (const clip of allClips) {
      if (!nowOnDisk.has(clip.filePath)) {
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
    return { added, updated, removed, total };
  }
}


