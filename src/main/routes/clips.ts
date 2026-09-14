import express from 'express';
import { randomUUID } from 'node:crypto';
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
import { ExportTimelineAction } from '../actions/ExportTimelineAction.js';
import { exportLabels, recordRejection, summarise } from '../services/highlights/labels.js';
import { registered } from '../services/highlights/registry.js';
import '../services/highlights/games/index.js';
import { EnsureClipSuggestionsAction } from '../actions/EnsureClipSuggestionsAction.js';
import { TrimVideoAction, type TrimMode } from '../actions/TrimVideoAction.js';
import {
  cancelJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  jobSignal,
  jobView,
  listJobs,
} from '../services/jobs.js';
import { detectEncoders } from '../services/encoders.js';
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
import { excludeHiddenGames } from '../utils/hiddenGames.js';
import { ClipDTO, ClipSuggestionsDTO, UpdateClipRequestDTO } from '@shared/index.js';
import type { ExportFormat } from '@shared/index.js';

const upload = multer({ storage: multer.memoryStorage() });

export const clipsRouter = express.Router();

clipsRouter.get('/', asyncHandler(async (req, res) => {
  const { game, q, tags, published, starred, includeHidden, sort, page = '1', pageSize = '50' } = req.query as Record<string, string>;
  const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
  const pageSz = Math.min(Math.max(parseInt(pageSize || '50', 10) || 50, 1), 200);

  const repo = AppDataSource.getRepository(Clip);
  /*
   * How the library is ordered.
   *
   * There was no sort at all: newest first was the only order on offer, and
   * ordering was by `createdAt`, when the row was written, so every clip that
   * was already on disk when GoodBit was installed shared one scan's timestamp
   * and the library came back in no particular order.
   *
   * `fileModifiedAt` is the recording's own date. `createdAt` breaks ties for
   * two recordings that really do share one.
   */
  const SORTS: Record<string, [string, 'ASC' | 'DESC']> = {
    newest: ['clip.recordedAt', 'DESC'],
    oldest: ['clip.recordedAt', 'ASC'],
    longest: ['clip.durationSec', 'DESC'],
    shortest: ['clip.durationSec', 'ASC'],
    largest: ['clip.sizeBytes', 'DESC'],
    smallest: ['clip.sizeBytes', 'ASC'],
    name: ['clip.filename', 'ASC'],
  };
  const [sortColumn, sortDirection] = SORTS[String(sort)] ?? SORTS.newest;

  let qb = repo
    .createQueryBuilder('clip')
    .leftJoinAndSelect('clip.tags', 'tag')
    .orderBy(sortColumn, sortDirection)
    .addOrderBy('clip.createdAt', 'DESC');

  if (game && game.length > 0) {
    // An explicit game filter is an explicit request for that folder, so it wins
    // over hiding, a hidden game stays reachable through its own filter or a link.
    qb = qb.andWhere('clip.game = :game', { game });
  } else if (includeHidden !== 'true') {
    qb = await excludeHiddenGames(qb);
  }

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
  const { startSec, endSec, mode } = req.body as {
    startSec: number;
    endSec: number;
    /** Absent lets the compress-trims setting decide. */
    mode?: TrimMode;
  };
  if (!(startSec >= 0) || !(endSec > startSec)) {
    return res.status(400).json({ error: 'Invalid range' });
  }
  if (mode !== undefined && !['lossless', 'exact', 'compressed'].includes(mode)) {
    return res.status(400).json({ error: 'Unknown trim mode' });
  }
  const result = await videoService.trimAndSwapClip(id, startSec, endSec, mode);
  // The actual range matters: a lossless cut snaps to a keyframe, so what
  // landed on disk can differ from what was asked for.
  res.json({ ok: true, ...result });
}));

/**
 * Where a lossless cut would actually land.
 *
 * Copying cannot start mid-GOP, so the Trim page shows the snapped position
 * before the user commits to it rather than surprising them afterwards.
 */
clipsRouter.get('/:id/keyframes', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneBy({ id });
  if (!clip) return res.status(404).json({ error: 'Clip not found' });

  const until = Number(req.query.until ?? 0) || 0;
  const keyframes = await new TrimVideoAction().keyframesUpTo(clip.filePath, until);
  res.json({ keyframes });
}));

/**
 * What one listen to this clip found, cached per file.
 *
 * Answers with `confident: false` far more often than not, and that is the
 * point, a clip whose sound never changes has nothing to point at.
 */
clipsRouter.get('/:id/suggestions', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const windowSec = Math.min(60, Math.max(2, Number(req.query.windowSec ?? 10) || 10));
  const refresh = req.query.refresh === 'true';

  const result = await new EnsureClipSuggestionsAction().execute({ clipId: id, windowSec, refresh });
  res.json(ClipSuggestionsDTO.fromAnalysis(id, result));
}));

/**
 * Which games have a module that reads their screen.
 *
 * Asked for before any clip is analysed, so the Trim page can say that a wait
 * is a few seconds of reading rather than a tenth of a second of listening.
 * Must be declared before `/:id/suggestions`, or Express reads "suggestions"
 * as a clip id.
 */
clipsRouter.get('/suggestions/watchers', asyncHandler(async (_req, res) => {
  const games = registered()
    .filter((entry) => entry.watches)
    .flatMap((entry) => entry.games.map((game) => game.toLowerCase()));
  res.json({ games, modules: registered() });
}));

/**
 * "That suggestion was wrong."
 *
 * One click, and the only way the app ever learns that a confident answer was
 * not a useful one. A trim records itself; being ignored does not, unless
 * someone says so.
 */
clipsRouter.post('/:id/suggestions/rejected', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const clip = await AppDataSource.getRepository(Clip).findOneByOrFail({ id });
  const result = await new EnsureClipSuggestionsAction().execute({ clipId: id });

  await recordRejection({
    clipId: id,
    game: clip.game,
    durationSec: result.durationSec,
    suggested: result.window,
    peakZ: result.peakZ,
    spreadLu: result.spreadLu,
    eventSec: result.eventSec,
  });

  res.json({ ok: true });
}));

/** How much supervision has been collected, for the settings screen. */
clipsRouter.get('/suggestions/labels', asyncHandler(async (_req, res) => {
  res.json(await summarise());
}));

/** Every label, for anyone who wants to fit something of their own offline. */
clipsRouter.get('/suggestions/labels/export', asyncHandler(async (_req, res) => {
  res.json(await exportLabels());
}));

/**
 * Fit the model now, to everything recorded so far. Normally this happens on
 * its own as labels arrive; this is the button for people who want to see it.
 */
clipsRouter.post('/suggestions/model/fit', asyncHandler(async (_req, res) => {
  const { fitNow } = await import('../services/highlights/train.js');
  const outcome = await fitNow();
  res.json(
    outcome.fitted
      ? { fitted: true, report: outcome.report }
      : { fitted: false, reason: outcome.reason, examples: outcome.examples },
  );
}));

/** Back to the built-in rule. The labels stay; only the fitted weights go. */
clipsRouter.delete('/suggestions/model', asyncHandler(async (_req, res) => {
  const { forgetLearnedModel } = await import('../services/highlights/train.js');
  res.json({ removed: forgetLearnedModel() });
}));

clipsRouter.post('/:id/publish', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { compress } = (req.body ?? {}) as { compress?: boolean };
  if (compress === true) {
    // A compressed copy is an offer for a clip that has never been published:
    // the file already up there is the file, and swapping it for a smaller one
    // behind a link that is already out is not what anyone clicked.
    const existing = await AppDataSource.getRepository(Clip).findOneByOrFail({ id });
    if (existing.published) {
      return res.status(409).json({ error: 'Already published. Unpublish it first to publish a compressed copy.' });
    }
  }
  const action = new PublishClipAction();
  const { clip } = await action.execute({ id, compress });
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

/**
 * Start a render and answer immediately with its id.
 *
 * A long export used to be awaited here, which meant a render past Cloudflare's
 * 100 second ceiling came back to the client as a 504 even though ffmpeg was
 * still working. The job now runs detached and the client polls for it.
 */
clipsRouter.post('/export', asyncHandler(async (req, res) => {
  const { clips, audio, outputName, format, framePos, normalizeLoudness } = req.body as {
    clips: unknown[];
    audio?: unknown[];
    outputName?: string;
    format?: ExportFormat;
    framePos?: number;
    normalizeLoudness?: boolean;
  };
  const exportId = typeof req.body.exportId === 'string' && req.body.exportId
    ? req.body.exportId
    : randomUUID();

  createJob('export', outputName ?? 'Export', exportId);
  const signal = jobSignal(exportId);

  void new ExportTimelineAction()
    .execute({
      clips: clips as never,
      audio: audio as never,
      outputName,
      exportId,
      format,
      framePos,
      normalizeLoudness,
      signal,
    })
    .then(({ clip }) => completeJob(exportId, ClipDTO.fromEntity(clip)))
    .catch((error: Error) => {
      // A cancel arrives here as an ffmpeg kill; failJob tells the two apart.
      if (!signal?.aborted) console.error('Export failed:', error);
      failJob(exportId, error.message);
    });

  res.status(202).json({ exportId });
}));

clipsRouter.get('/export/:exportId/status', asyncHandler(async (req, res) => {
  const job = getJob(req.params.exportId);
  if (!job) return res.status(404).json({ error: 'Unknown export' });
  res.json(jobView(job));
}));

/** Stop a running render. ffmpeg used to keep going with nobody waiting for it. */
clipsRouter.delete('/export/:exportId', asyncHandler(async (req, res) => {
  const stopped = cancelJob(req.params.exportId);
  if (!stopped) return res.status(404).json({ error: 'No running job with that id' });
  res.json({ ok: true });
}));

/** Everything running or recently finished, for a jobs readout. */
clipsRouter.get('/jobs/list', asyncHandler(async (_req, res) => {
  res.json(listJobs().map(jobView));
}));

/** What this machine can do: shown on the Settings health panel. */
clipsRouter.get('/system/encoders', asyncHandler(async (_req, res) => {
  res.json(await detectEncoders());
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

