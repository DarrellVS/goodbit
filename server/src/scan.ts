import path from 'node:path';
import fs from 'node:fs/promises';
import fg from 'fast-glob';
import { AppDataSource, VIDEOS_ROOT } from './data-source.js';
import { Clip } from './entity/Clip.js';

function toRelPath(absolutePath: string): string {
  return path.relative(VIDEOS_ROOT, absolutePath);
}

export async function scanAndSyncClips(): Promise<{ added: number; updated: number; removed: number; total: number }>
{
  const repo = AppDataSource.getRepository(Clip);

  const patterns = [
    '*/*.mp4',
    '*/*.mov',
    '*/*.MP4',
    '*/*.MOV',
  ];

  const entries = await fg(patterns, {
    cwd: VIDEOS_ROOT,
    onlyFiles: true,
    dot: false,
    unique: true,
    followSymbolicLinks: true,
    absolute: true,
  });

  const nowOnDisk = new Set<string>();
  let added = 0;
  let updated = 0;

  for (const absPath of entries) {
    nowOnDisk.add(absPath);
    const rel = toRelPath(absPath);
    const game = rel.split(path.sep)[0] || '';
    const filename = path.basename(absPath);
    const extension = path.extname(filename).slice(1);
    const stat = await fs.stat(absPath);

    const existing = await repo.findOne({ where: { filePath: absPath } });
    if (!existing) {
      const clip = repo.create({
        filePath: absPath,
        relPath: rel,
        game,
        filename,
        extension,
        sizeBytes: stat.size,
        fileModifiedAt: stat.mtime,
        displayName: null,
      });
      await repo.save(clip);
      added += 1;
    } else {
      // Update size or mtime changes
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
        await repo.save(existing);
        updated += 1;
      }
    }
  }

  // Remove entries that no longer exist on disk
  const allClips = await repo.find();
  let removed = 0;
  for (const clip of allClips) {
    if (!nowOnDisk.has(clip.filePath)) {
      await repo.remove(clip);
      removed += 1;
    }
  }

  const total = await repo.count();
  return { added, updated, removed, total };
}


