import express from 'express';
import fs from 'node:fs';
import { AppDataSource, VIDEOS_ROOT } from './data-source.js';
import { Clip } from './entity/Clip.js';
import { scanAndSyncClips } from './scan.js';
import trash from 'trash';

export const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.post('/scan', async (_req, res, next) => {
  try {
    const result = await scanAndSyncClips();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/games', async (_req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Clip);
    const rows = await repo
      .createQueryBuilder('clip')
      .select('clip.game', 'game')
      .addSelect('COUNT(*)', 'count')
      .groupBy('clip.game')
      .orderBy('clip.game', 'ASC')
      .getRawMany();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/clips', async (req, res, next) => {
  try {
    const { game, q, page = '1', pageSize = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
    const pageSz = Math.min(Math.max(parseInt(pageSize || '50', 10) || 50, 1), 200);

    const repo = AppDataSource.getRepository(Clip);
    let qb = repo.createQueryBuilder('clip').orderBy('clip.fileModifiedAt', 'DESC');
    if (game && game.length > 0) {
      qb = qb.andWhere('clip.game = :game', { game });
    }
    if (q && q.length > 0) {
      qb = qb.andWhere('(clip.filename LIKE :q OR clip.displayName LIKE :q)', { q: `%${q}%` });
    }
    const [items, total] = await qb
      .skip((pageNum - 1) * pageSz)
      .take(pageSz)
      .getManyAndCount();
    res.json({ items, total, page: pageNum, pageSize: pageSz });
  } catch (err) {
    next(err);
  }
});

router.get('/clips/:id/stream', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    const filePath = clip.filePath;

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': clip.extension.toLowerCase() === 'mov' ? 'video/quicktime' : 'video/mp4',
      } as const;
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': clip.extension.toLowerCase() === 'mov' ? 'video/quicktime' : 'video/mp4',
      } as const;
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
});

router.patch('/clips/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { displayName } = req.body as { displayName?: string | null };
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    clip.displayName = displayName === undefined ? clip.displayName : (displayName && displayName.trim().length > 0 ? displayName.trim() : null);
    await repo.save(clip);
    res.json(clip);
  } catch (err) {
    next(err);
  }
});

router.delete('/clips/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });

    // Move to recycle bin for safety
    await trash([clip.filePath]);
    await repo.remove(clip);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


