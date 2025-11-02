import express from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { In } from 'typeorm';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Tag } from '../entity/Tag.js';
import { Game } from '../entity/Game.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { videoService } from '../services/videoService.js';
import { publisherService } from '../services/publisherService.js';
import { PublishClipAction } from '../actions/PublishClipAction.js';
import { UnpublishClipAction } from '../actions/UnpublishClipAction.js';
import { ExportTimelineAction, exportProgress } from '../actions/ExportTimelineAction.js';
import {
  BatchStarAction,
  BatchPublishAction,
  BatchAddTagsAction,
  BatchDeleteAction
} from '../actions/BatchOperationsAction.js';
import { ImportFilesAction } from '../actions/ImportFilesAction.js';
import { MoveClipToGameAction } from '../actions/MoveClipToGameAction.js';
import { ExportAudioAction } from '../actions/ExportAudioAction.js';
import { GetClipCollectionsAction } from '../actions/GetClipCollectionsAction.js';
import { OpenFileInExplorerAction } from '../actions/OpenFileInExplorerAction.js';
import { cleanupEmptyFolders } from '../utils/cleanupEmptyFolders.js';
import { ClipDTO, UpdateClipRequestDTO } from '../../../shared/index.js';

const upload = multer({ storage: multer.memoryStorage() });

export const clipsRouter = express.Router();

clipsRouter.get('/', asyncHandler(async (req, res) => {
  const { game, q, tags, published, starred, page = '1', pageSize = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
  const pageSz = Math.min(Math.max(parseInt(pageSize || '50', 10) || 50, 1), 200);

  const repo = AppDataSource.getRepository(Clip);
  let qb = repo
    .createQueryBuilder('clip')
    .leftJoinAndSelect('clip.tags', 'tag')
    .orderBy('clip.createdAt', 'DESC');

  if (game && game.length > 0) qb = qb.andWhere('clip.game = :game', { game });

  if (published === 'true') qb = qb.andWhere('clip.published = :published', { published: true });
  if (published === 'false') qb = qb.andWhere('clip.published = :published', { published: false });

  if (starred === 'true') qb = qb.andWhere('(clip.starred = :starred)', { starred: true });

  if (q && q.length > 0) {
    qb = qb.andWhere('(' +
      'clip.filename LIKE :q OR ' +
      'clip.displayName LIKE :q OR ' +
      'tag.name LIKE :q' +
      ')', { q: `%${q}%` });
  }

  if (tags && tags.length > 0) {
    const tagList = tags.split(',').map((s) => s.trim()).filter(Boolean);
    if (tagList.length > 0) {
      qb = qb.andWhere('tag.name IN (:...names)', { names: tagList })
        .groupBy('clip.id')
        .having('COUNT(DISTINCT tag.name) >= :required', { required: tagList.length });
    }
  }

  const [items, total] = await qb.skip((pageNum - 1) * pageSz).take(pageSz).getManyAndCount();
  const dtos = items.map((c) => ClipDTO.fromEntity(c));
  res.json({ items: dtos, total, page: pageNum, pageSize: pageSz });
}));

clipsRouter.get('/latest', asyncHandler(async (req, res) => {
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOne({
    order: { createdAt: 'DESC' },
    relations: ['tags']
  });

  if (!clip) {
    return res.status(404).json({ error: 'No clips found' });
  }

  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
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

clipsRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOne({
    where: { id },
    relations: ['tags']
  });

  if (!clip) {
    return res.status(404).json({ error: 'Clip not found' });
  }

  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

// Batch operations (must be before /:id routes to avoid matching "batch" as an id)
clipsRouter.post('/batch/star', asyncHandler(async (req, res) => {
  console.log('Batch star request:', req.body);
  const { clipIds, starred } = req.body as { clipIds: number[]; starred: boolean };
  const action = new BatchStarAction();
  const result = await action.execute({ clipIds, starred });
  res.json(result);
}));

clipsRouter.post('/batch/publish', asyncHandler(async (req, res) => {
  console.log('Batch publish request:', req.body);
  const { clipIds, publish } = req.body as { clipIds: number[]; publish: boolean };
  const action = new BatchPublishAction();
  const result = await action.execute({ clipIds, publish });
  res.json(result);
}));

clipsRouter.post('/batch/add-tags', asyncHandler(async (req, res) => {
  console.log('Batch add tags request:', req.body);
  const { clipIds, tags } = req.body as { clipIds: number[]; tags: string[] };
  const action = new BatchAddTagsAction();
  const result = await action.execute({ clipIds, tags });
  res.json(result);
}));

clipsRouter.post('/batch/delete', asyncHandler(async (req, res) => {
  console.log('Batch delete request:', req.body);
  const { clipIds } = req.body as { clipIds: number[] };
  const action = new BatchDeleteAction();
  const result = await action.execute({ clipIds });
  res.json(result);
}));

clipsRouter.post('/:id/open', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await videoService.openClip(id);
  res.json({ ok: true });
}));

clipsRouter.post('/:id/export-audio', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const action = new ExportAudioAction();
  const result = await action.execute({ clipId: id });
  res.json(result);
}));

clipsRouter.get('/:id/collections', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const action = new GetClipCollectionsAction();
  const result = await action.execute({ clipId: id });
  res.json(result);
}));

clipsRouter.post('/reveal-file', asyncHandler(async (req, res) => {
  const { filePath } = req.body as { filePath: string };

  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath is required' });
  }

  const action = new OpenFileInExplorerAction();
  await action.execute({ filePath });
  res.json({ ok: true });
}));

clipsRouter.post('/:id/move-to-game', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { targetGame } = req.body as { targetGame: string };

  if (!targetGame || targetGame.trim().length === 0) {
    return res.status(400).json({ error: 'targetGame is required' });
  }

  const action = new MoveClipToGameAction();
  const { clip } = await action.execute({ clipId: id, targetGame: targetGame.trim() });

  // Invalidate caches after move
  await videoService.removeClipCaches(clip.filePath);

  const withTags = await AppDataSource.getRepository(Clip).findOne({
    where: { id: clip.id },
    relations: ['tags']
  });
  const dto = withTags ? ClipDTO.fromEntity(withTags) : ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const updateDto = Object.assign(new UpdateClipRequestDTO(), req.body);

  // Validate request
  const validation = updateDto.validate();
  if (!validation.isValid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const repo = AppDataSource.getRepository(Clip);
  const gameRepo = AppDataSource.getRepository(Game);
  const tagRepo = AppDataSource.getRepository(Tag);
  const clip = await repo.findOne({ where: { id }, relations: ['tags'] }) as Clip | null;
  if (!clip) return res.status(404).json({ error: 'Not found' });

  const wasPublished = clip.published;
  const displayNameChanged = updateDto.displayName !== undefined && 
    updateDto.displayName !== clip.displayName;

  // Apply updates from DTO
  if (updateDto.displayName !== undefined) {
    clip.displayName = updateDto.displayName && updateDto.displayName.trim().length > 0
      ? updateDto.displayName.trim()
      : null;
  }

  if (updateDto.notes !== undefined) {
    clip.notes = updateDto.notes && updateDto.notes.trim().length > 0 ? updateDto.notes.trim() : null;
  }

  if (updateDto.starred !== undefined) {
    clip.starred = updateDto.starred;
  }

  if (updateDto.tags !== undefined) {
    const tags: string[] = updateDto.tags;
    const normalized: string[] = Array.isArray(tags)
      ? Array.from(new Set(tags.map(t => t.trim()).filter(t => t.length > 0)))
      : [];

    if (normalized.length === 0) {
      clip.tags = [];
    } else {
      const existing = await tagRepo.find({ where: { name: In(normalized) } });
      const existingNames = new Set(existing.map((t) => t.name));
      const toCreateNames = normalized.filter((n: string) => !existingNames.has(n)) as string[];
      const toCreate = toCreateNames.map((name: string) => tagRepo.create({ name }));

      if (toCreate.length) await tagRepo.save(toCreate);

      const all = await tagRepo.find({ where: { name: In(normalized) } });
      clip.tags = all;
    }
  }

  const saved = await repo.save(clip);
  
  // Update metadata on publisher if clip is published and displayName changed
  if (wasPublished && displayNameChanged) {
    try {
      const game = await gameRepo.findOne({ where: { name: saved.game } });
      const gameDisplayName = game?.displayName || saved.game;
      await publisherService.updateMetadata(
        saved.filename,
        saved.displayName || saved.filename,
        gameDisplayName
      );
    } catch (error) {
      console.error('Failed to update published clip metadata:', error);
    }
  }
  
  const dto = ClipDTO.fromEntity(saved);

  res.json(dto);
}));

clipsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneByOrFail({ id });
  // If published, unpublish first (remote delete + cache purge)
  if (clip.published) {
    try {
      const action = new UnpublishClipAction();
      await action.execute({ id });
    } catch (err) {
      // Proceed even if remote unpublish fails
      console.warn('Unpublish before delete failed:', (err as Error)?.message);
    }
  }
  await videoService.removeClipCaches(clip.filePath);
  await videoService.moveClipFileToTrash(clip.filePath);
  await repo.remove(clip);

  // Clean up empty folders after delete (async, don't wait)
  cleanupEmptyFolders(VIDEOS_ROOT).catch((err) => {
    console.error('Failed to cleanup empty folders after delete:', err);
  });

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
  const repo = AppDataSource.getRepository(Clip);
  const withTags = await repo.findOne({ where: { id: clip.id }, relations: ['tags'] });
  const dto = withTags ? ClipDTO.fromEntity(withTags) : ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.post('/import', upload.array('files'), asyncHandler(async (req, res) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const action = new ImportFilesAction();
  const result = await action.execute({
    files: files.map(f => ({
      name: f.originalname,
      size: f.size,
      data: f.buffer,
    })),
  });

  // Convert clips to DTOs
  const dtos = result.clips.map(clip => ClipDTO.fromEntity(clip));
  res.json({ ...result, clips: dtos });
}));

clipsRouter.post('/export', asyncHandler(async (req, res) => {
  const { clips, outputName, exportId } = req.body;
  const action = new ExportTimelineAction();
  const { clip } = await action.execute({ clips, outputName, exportId });
  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.get('/export/:exportId/progress', asyncHandler(async (req, res) => {
  const { exportId } = req.params;
  const progress = exportProgress.get(exportId);
  res.json({ progress: progress ?? null });
}));

clipsRouter.post('/:id/unpublish', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const action = new UnpublishClipAction();
  const { clip } = await action.execute({ id });
  const repo = AppDataSource.getRepository(Clip);
  const withTags = await repo.findOne({ where: { id: clip.id }, relations: ['tags'] });
  const dto = withTags ? ClipDTO.fromEntity(withTags) : ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.post('/:id/star', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneOrFail({ where: { id }, relations: ['tags'] });
  clip.starred = true;
  await repo.save(clip);
  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.post('/:id/unstar', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneOrFail({ where: { id }, relations: ['tags'] });
  clip.starred = false;
  await repo.save(clip);
  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

