import express from 'express';
import fs from 'node:fs';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { videoService } from '../services/videoService.js';
import { PublishClipAction } from '../actions/PublishClipAction.js';
import { UnpublishClipAction } from '../actions/UnpublishClipAction.js';

export const clipsRouter = express.Router();

clipsRouter.get('/', asyncHandler(async (req, res) => {
  const { game, q, page = '1', pageSize = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
  const pageSz = Math.min(Math.max(parseInt(pageSize || '50', 10) || 50, 1), 200);

  const repo = AppDataSource.getRepository(Clip);
  let qb = repo.createQueryBuilder('clip').orderBy('clip.fileModifiedAt', 'DESC');
  if (game && game.length > 0) qb = qb.andWhere('clip.game = :game', { game });
  if (q && q.length > 0) qb = qb.andWhere('(clip.filename LIKE :q OR clip.displayName LIKE :q)', { q: `%${q}%` });
  const [items, total] = await qb.skip((pageNum - 1) * pageSz).take(pageSz).getManyAndCount();
  res.json({ items, total, page: pageNum, pageSize: pageSz });
}));

clipsRouter.get('/:id/stream', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneByOrFail({ id });
  const filePath = clip.filePath;

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1;
    if (start >= fileSize || start > end) { start = 0; end = fileSize - 1; }
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': clip.extension.toLowerCase() === 'mov' ? 'video/quicktime' : 'video/mp4',
      'Cache-Control': 'no-store',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': clip.extension.toLowerCase() === 'mov' ? 'video/quicktime' : 'video/mp4',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}));

clipsRouter.get('/:id/thumbnail', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneByOrFail({ id });
  const thumbPath = await videoService.ensureThumbnail(clip);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(thumbPath);
}));

clipsRouter.get('/:id/frame-strip', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneByOrFail({ id });
  const stripPath = await videoService.ensureFrameStrip(clip);
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(stripPath);
}));

clipsRouter.get('/:id/meta', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const meta = await videoService.getClipMeta(id);
  res.json(meta);
}));

clipsRouter.post('/:id/open', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await videoService.openClip(id);
  res.json({ ok: true });
}));

clipsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { displayName } = req.body as { displayName?: string | null };
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneByOrFail({ id });
  clip.displayName = displayName === undefined ? clip.displayName : (displayName && displayName.trim().length > 0 ? displayName.trim() : null);
  await repo.save(clip);
  res.json(clip);
}));

clipsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneByOrFail({ id });
  await videoService.removeClipCaches(clip.filePath);
  await videoService.moveClipFileToTrash(clip.filePath);
  await repo.remove(clip);
  res.json({ ok: true });
}));

clipsRouter.post('/:id/trim', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { startSec, endSec } = req.body as { startSec: number; endSec: number };
  if (!(startSec >= 0) || !(endSec > startSec)) {
    return res.status(400).json({ error: 'Invalid range' });
  }
  await videoService.trimAndSwapClip(id, startSec, endSec);
  res.json({ ok: true });
}));

clipsRouter.post('/:id/publish', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const action = new PublishClipAction();
  const { clip } = await action.execute({ id });
  res.json(clip);
}));

clipsRouter.post('/:id/unpublish', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const action = new UnpublishClipAction();
  const { clip } = await action.execute({ id });
  res.json(clip);
}));


