import { ipcMain, shell } from 'electron';
import { AppDataSource } from '../../../server/src/data-source.ts';
import { Clip } from '../../../server/src/entity/Clip.ts';
import { scanAndSyncClips } from '../../../server/src/scan.ts';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import path from 'node:path';
import fsPromises from 'node:fs/promises';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath?.path) {
  ffmpeg.setFfprobePath(ffprobePath.path);
}

export function registerClipIpc(): void {
  ipcMain.handle('clips:scan', async () => {
    return scanAndSyncClips();
  });

  ipcMain.handle('clips:games', async () => {
    const repo = AppDataSource.getRepository(Clip);
    return repo
      .createQueryBuilder('clip')
      .select('clip.game', 'game')
      .addSelect('COUNT(*)', 'count')
      .groupBy('clip.game')
      .orderBy('clip.game', 'ASC')
      .getRawMany();
  });

  ipcMain.handle('clips:list', async (_e, { game, q, page = 1, pageSize = 50 }) => {
    const pageNum = Math.max(parseInt(String(page) || '1', 10) || 1, 1);
    const pageSz = Math.min(Math.max(parseInt(String(pageSize) || '50', 10) || 50, 1), 200);
    const repo = AppDataSource.getRepository(Clip);
    let qb = repo.createQueryBuilder('clip').orderBy('clip.fileModifiedAt', 'DESC');
    if (game) qb = qb.andWhere('clip.game = :game', { game });
    if (q) qb = qb.andWhere('(clip.filename LIKE :q OR clip.displayName LIKE :q)', { q: `%${q}%` });
    const [items, total] = await qb.skip((pageNum - 1) * pageSz).take(pageSz).getManyAndCount();
    return { items, total, page: pageNum, pageSize: pageSz };
  });

  ipcMain.handle('clips:update', async (_e, { id, payload }) => {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: Number(id) });
    const displayName = (payload?.displayName ?? undefined);
    clip.displayName = displayName === undefined ? clip.displayName : (displayName && String(displayName).trim().length > 0 ? String(displayName).trim() : null);
    await repo.save(clip);
    return clip;
  });

  ipcMain.handle('clips:delete', async (_e, { id }) => {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: Number(id) });
    const { default: trash } = await import('trash');
    await trash([clip.filePath]);
    await repo.remove(clip);
    return { ok: true } as const;
  });

  ipcMain.handle('clips:open', async (_e, { id }) => {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: Number(id) });
    shell.showItemInFolder(clip.filePath);
    return { ok: true } as const;
  });

  ipcMain.handle('clips:meta', async (_e, { id }) => {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: Number(id) });
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(clip.filePath, (err, data) => {
        if (err) return reject(err);
        const format: any = data.format || {};
        const streams: any[] = data.streams || [];
        const v: any = streams.find((s: any) => s.codec_type === 'video');
        resolve({
          durationSec: Number(format.duration || 0),
          width: v?.width || null,
          height: v?.height || null,
          codec: v?.codec_name || null,
          fps: v?.avg_frame_rate || v?.r_frame_rate || null,
        });
      });
    });
  });

  ipcMain.handle('clips:trim', async (_e, { id, range }) => {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: Number(id) });
    const startSec = Number(range?.startSec);
    const endSec = Number(range?.endSec);
    if (!(startSec >= 0) || !(endSec > startSec)) {
      throw new Error('Invalid range');
    }

    const dir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath) || '.mp4';
    const tmpPath = path.join(dir, `${path.basename(clip.filePath, ext)}.tmp-${Date.now()}${ext}`);
    const bakPath = `${clip.filePath}.bak`;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(clip.filePath)
        .setStartTime(startSec)
        .setDuration(endSec - startSec)
        .outputOptions(['-c:v libx264', '-c:a aac', '-preset veryfast', '-y'])
        .save(tmpPath)
        .on('end', () => resolve())
        .on('error', (e) => reject(e));
    });

    try {
      try { await fsPromises.rm(bakPath, { force: true }); } catch {}
      await fsPromises.rename(clip.filePath, bakPath);
      await fsPromises.rename(tmpPath, clip.filePath);
      try { await fsPromises.rm(bakPath, { force: true }); } catch {}

      const st = await fsPromises.stat(clip.filePath);
      clip.sizeBytes = st.size;
      clip.fileModifiedAt = st.mtime as any;
      await repo.save(clip);
      return { ok: true } as const;
    } catch (e) {
      try { await fsPromises.rm(tmpPath, { force: true }); } catch {}
      throw e;
    }
  });
}


