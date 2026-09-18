import express from 'express';
import { randomUUID } from 'node:crypto';
import { EntityNotFoundError, In } from 'typeorm';
import { RecordClipOpenedAction } from '../actions/RecordClipOpenedAction.js';
import { planSearch } from '../services/clipSearch.js';
import { searchIndexUsable } from '../services/clipSearchIndex.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Tag } from '../entity/Tag.js';
import { Game } from '../entity/Game.js';
import { GoodBit, type GoodBitSource } from '../entity/GoodBit.js';
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
import { CreateGoodBitAction } from '../actions/CreateGoodBitAction.js';
import { UpdateGoodBitAction } from '../actions/UpdateGoodBitAction.js';
import { DeleteGoodBitAction } from '../actions/DeleteGoodBitAction.js';
import { ListGoodBitsAction } from '../actions/ListGoodBitsAction.js';
import { RenderGoodBitAction } from '../actions/RenderGoodBitAction.js';
import { GetClipAudioTracksAction } from '../actions/GetClipAudioTracksAction.js';
import type { ClipAudioSelection } from '@shared/index.js';
import { GoodBitRangeError } from '../services/goodBits.js';
import {
  cancelJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  jobSignal,
  jobView,
  listJobs,
  setJobProgress,
} from '../services/jobs.js';
import { detectEncoders } from '../services/encoders.js';
import { attachGoodBitRanges } from '../services/goodBitRanges.js';
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
import { ClipDTO, ClipSuggestionsDTO, GoodBitDTO, UpdateClipRequestDTO } from '@shared/index.js';
import type { ExportFormat } from '@shared/index.js';


export const clipsRouter = express.Router();

clipsRouter.get('/', asyncHandler(async (req, res) => {
  const { game, games, q, tags, published, starred, includeHidden, sort, page = '1', pageSize = '50' } = req.query as Record<string, string>;
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

  /*
   * One game, several, or all of them.
   *
   * `games` is a comma separated list and `game` is the single one this route
   * has always taken; both are read because the second is what the editor's
   * clip picker, the e2e suite and anything holding an old link still send,
   * and a filter that silently stopped working would look like an empty
   * library rather than a changed parameter.
   */
  const gameList = (games ?? game ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (gameList.length > 0) {
    // An explicit game filter is an explicit request for those folders, so it
    // wins over hiding, a hidden game stays reachable through its own filter
    // or a link.
    qb = qb.andWhere('clip.game IN (:...gameList)', { gameList });
  } else if (includeHidden !== 'true') {
    qb = await excludeHiddenGames(qb);
  }

  if (published === 'true') qb = qb.andWhere('clip.published = :published', { published: true });
  if (published === 'false') qb = qb.andWhere('clip.published = :published', { published: false });

  if (starred === 'true') qb = qb.andWhere('(clip.starred = :starred)', { starred: true });

  /*
   * Search goes through the index, and falls back rather than failing.
   *
   * This was four `LIKE '%q%'` clauses which could not use an index, matched
   * inside words, and **never looked at notes**, which is the one place
   * somebody wrote down what happened in a clip.
   *
   * `clip_search` is FTS5 over filename, displayName, notes and game. The
   * subquery shape rather than a join, because the join would multiply rows
   * against `clip.tags` and the paging count with it.
   *
   * The fallback is not defensive padding. The index is built by a migration
   * and maintained by triggers, and if either has not run, or somebody's
   * SQLite was built without FTS5, then the right outcome is a search that
   * works less well rather than a library that will not load. It logs once so
   * the cause is findable.
   */
  const search = planSearch(q);
  if (search.match) {
    if (await searchIndexUsable()) {
      /*
       * The index, or a tag. Both, because the box says both.
       *
       * `clip_search` covers filename, displayName, notes and game, and tags
       * are deliberately not in it: they are a join table, so indexing them
       * would need triggers of their own, and a tag is a filter rather than
       * prose. That reasoning still holds and the index is unchanged.
       *
       * What did not hold was the promise. The placeholder says "Search names,
       * dates and tags" and the empty state says "and your tags", and typing a
       * tag returned nothing on any install where FTS5 works, which is all of
       * them. The only path that ever looked at `tag.name` was the fallback
       * below, which runs when the index is missing. So the app searched tags
       * exactly when it was least able to.
       *
       * A second subquery rather than a join: the tag table is already joined
       * for the tag *filter*, and widening this clause to use it would multiply
       * rows per tag and take the paging count with it. `IN (SELECT ...)`
       * answers yes or no once per clip.
       */
      qb = qb.andWhere(
        `(clip.id IN (SELECT rowid FROM clip_search WHERE clip_search MATCH :match)
          OR clip.id IN (
            SELECT ct."clipId" FROM clip_tags_tag ct
            JOIN tag t ON t.id = ct."tagId"
            WHERE t.name LIKE :tagLike
          ))`,
        { match: search.match, tagLike: `%${q}%` },
      );
    } else {
      qb = qb.andWhere(
        '(clip.filename LIKE :like OR clip.displayName LIKE :like OR clip.notes LIKE :like OR tag.name LIKE :like)',
        { like: `%${q}%` },
      );
    }
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
  // So a card can draw its marked ranges without asking per tile.
  await attachGoodBitRanges(dtos);
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
    relations: { tags: true }
  });

  if (!clip) {
    return res.status(404).json({ error: 'Clip not found' });
  }

  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

/*
 * Batch operations. These must come before the `/:id` routes, or Express
 * matches "batch" as an id.
 *
 * Each of these used to log its whole request body. That is a list of clip
 * ids, which is noise, and for tagging it is the **tag names somebody typed**,
 * which is their own content and does not belong in a log file that gets
 * pasted into an issue. The count is the part anybody debugging wants, and the
 * action reports what it actually did.
 */
clipsRouter.post('/batch/star', asyncHandler(async (req, res) => {
  const { clipIds, starred } = req.body as { clipIds: number[]; starred: boolean };
  console.log(`[batch] ${starred ? 'star' : 'unstar'} ${clipIds?.length ?? 0} clips`);
  const action = new BatchStarAction();
  const result = await action.execute({ clipIds, starred });
  res.json(result);
}));

clipsRouter.post('/batch/publish', asyncHandler(async (req, res) => {
  const { clipIds, publish } = req.body as { clipIds: number[]; publish: boolean };
  console.log(`[batch] ${publish ? 'publish' : 'unpublish'} ${clipIds?.length ?? 0} clips`);
  const action = new BatchPublishAction();
  const result = await action.execute({ clipIds, publish });
  res.json(result);
}));

clipsRouter.post('/batch/add-tags', asyncHandler(async (req, res) => {
  const { clipIds, tags } = req.body as { clipIds: number[]; tags: string[] };
  // The number of tags, not the tags. They are somebody's own words.
  console.log(`[batch] add ${tags?.length ?? 0} tags to ${clipIds?.length ?? 0} clips`);
  const action = new BatchAddTagsAction();
  const result = await action.execute({ clipIds, tags });
  res.json(result);
}));

clipsRouter.post('/batch/delete', asyncHandler(async (req, res) => {
  const { clipIds } = req.body as { clipIds: number[] };
  console.log(`[batch] delete ${clipIds?.length ?? 0} clips`);
  const action = new BatchDeleteAction();
  const result = await action.execute({ clipIds });
  res.json(result);
}));

clipsRouter.post('/:id/open', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await videoService.openClip(id);
  res.json({ ok: true });
}));

/**
 * Somebody looked at this clip.
 *
 * Not the same thing as `/open` above, which reveals the file in Explorer. This
 * is the renderer saying a clip was opened to be watched, which is the only
 * place that is known: main sees a metadata fetch, which might be a prefetch,
 * and a run of Range requests for the video, which is one view arriving as
 * twenty.
 *
 * Nothing reads `lastOpenedAt` yet. It is collected now because it **cannot be
 * backfilled**, and the retention screen's most useful signal is "never
 * opened". A failure here is not worth telling anybody about, so a clip that
 * has since been deleted answers 404 and the renderer ignores it.
 */
clipsRouter.post('/:id/opened', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  try {
    const result = await new RecordClipOpenedAction().execute({ clipId: id });
    res.json(result);
  } catch (error) {
    if (error instanceof EntityNotFoundError) {
      return res.status(404).json({ error: 'No clip with that id' });
    }
    throw error;
  }
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
    relations: { tags: true }
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
  const clip = await repo.findOne({ where: { id }, relations: { tags: true } }) as Clip | null;
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

/**
 * What sound this clip holds, one stream at a time.
 *
 * Read rather than stored. The names come from the OBS setup's own manifest
 * and a clip outlives a setup, so this is worked out against the file in front
 * of it every time and never written down anywhere it could go stale.
 */
clipsRouter.get('/:id/audio-tracks', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  res.json(await new GetClipAudioTracksAction().execute({ clipId: id }));
}));

clipsRouter.post('/:id/trim', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { startSec, endSec, mode, audio } = req.body as {
    startSec: number;
    endSec: number;
    /** Absent lets the compress-trims setting decide. */
    mode?: TrimMode;
    /** Mutes and levels, by audio track index. Absent keeps every track. */
    audio?: ClipAudioSelection[];
  };
  if (!(startSec >= 0) || !(endSec > startSec)) {
    return res.status(400).json({ error: 'Invalid range' });
  }
  if (mode !== undefined && !['lossless', 'exact', 'compressed'].includes(mode)) {
    return res.status(400).json({ error: 'Unknown trim mode' });
  }
  if (audio !== undefined && !Array.isArray(audio)) {
    return res.status(400).json({ error: 'Audio selection must be a list' });
  }
  const result = await videoService.trimAndSwapClip(id, startSec, endSec, mode, audio);
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

/*
 * The bits of a clip worth watching.
 *
 * Nested under the clip, because a GoodBit is not a thing on its own: it is a
 * start and an end inside one recording, it dies with that recording, and
 * "which clip" is never a question the caller has to be asked. So the clip id
 * is in the path rather than in a body, and an id pair that does not match is
 * a 404 rather than an edit to somebody else's recording.
 *
 * A trim replaces the file; none of this does. The recording stays whole and
 * carries a list, which is metadata about content that is already on disk, the
 * same footing as `displayName`.
 */

/**
 * The two things a GoodBit request gets wrong, said in words rather than in SQL.
 *
 * `GoodBitRangeError` carries a status for `middlewares/errorHandler.ts`, but
 * that handler answers `{ status, code, message }` and every hand-written
 * refusal in this file answers `{ error }`. One shape per file beats one shape
 * per mechanism. The other case is TypeORM's `findOneByOrFail` on an id that
 * is not there, which is a 404 and would otherwise be a 500 with an entity
 * name in it; `missing` is what to call the thing, since the same error covers
 * a clip that has gone and a GoodBit that was never on it.
 */
function goodBitFailure(res: express.Response, error: unknown, missing: string): boolean {
  if (error instanceof GoodBitRangeError) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  /*
   * `instanceof`, not a name comparison.
   *
   * This was `(error as Error)?.name === 'EntityNotFoundError'`, which works
   * against the source and fails in the app. `TypeORMError` sets
   * `this.name = this.constructor.name`, and rollup renames the class to
   * `EntityNotFoundError2` while bundling main, because another declaration
   * already claims that identifier. So the string never matched, the error was
   * rethrown, and a PATCH for a GoodBit belonging to another clip answered 500
   * with a stack trace instead of 404 with a sentence.
   *
   * Only the built app shows this. Nothing in the unit suite imports the
   * bundle, so `tests/e2e/goodbits.spec.ts` is what caught it.
   */
  if (error instanceof EntityNotFoundError) {
    res.status(404).json({ error: missing });
    return true;
  }
  return false;
}

clipsRouter.get('/:id/goodbits', asyncHandler(async (req, res) => {
  const clipId = Number(req.params.id);
  const { goodBits } = await new ListGoodBitsAction().execute({ clipId });
  res.json({ items: goodBits.map((goodBit) => GoodBitDTO.fromEntity(goodBit)) });
}));

clipsRouter.post('/:id/goodbits', asyncHandler(async (req, res) => {
  const clipId = Number(req.params.id);
  const { startSec, endSec, name, source, reason, confidence } = (req.body ?? {}) as {
    startSec?: number;
    endSec?: number;
    name?: string | null;
    source?: GoodBitSource;
    reason?: string | null;
    confidence?: number | null;
  };

  if (source !== undefined && !['manual', 'hud', 'audio'].includes(source)) {
    return res.status(400).json({ error: 'Unknown GoodBit source' });
  }

  try {
    const { goodBit } = await new CreateGoodBitAction().execute({
      clipId,
      startSec: Number(startSec),
      endSec: Number(endSec),
      name,
      source,
      reason,
      confidence,
    });
    res.status(201).json(GoodBitDTO.fromEntity(goodBit));
  } catch (error) {
    if (!goodBitFailure(res, error, 'Clip not found')) throw error;
  }
}));

clipsRouter.patch('/:id/goodbits/:goodBitId', asyncHandler(async (req, res) => {
  const clipId = Number(req.params.id);
  const goodBitId = Number(req.params.goodBitId);
  const { startSec, endSec, name } = (req.body ?? {}) as {
    startSec?: number;
    endSec?: number;
    name?: string | null;
  };

  try {
    const { goodBit } = await new UpdateGoodBitAction().execute({
      clipId,
      goodBitId,
      // An absent edge stays where it is, so `undefined` has to survive the
      // trip; `Number(undefined)` is NaN, which would read as a bad request.
      startSec: startSec === undefined ? undefined : Number(startSec),
      endSec: endSec === undefined ? undefined : Number(endSec),
      name,
    });
    res.json(GoodBitDTO.fromEntity(goodBit));
  } catch (error) {
    if (!goodBitFailure(res, error, 'No GoodBit with that id on this clip')) throw error;
  }
}));

clipsRouter.delete('/:id/goodbits/:goodBitId', asyncHandler(async (req, res) => {
  const clipId = Number(req.params.id);
  const goodBitId = Number(req.params.goodBitId);
  const { deleted } = await new DeleteGoodBitAction().execute({ clipId, goodBitId });
  if (!deleted) return res.status(404).json({ error: 'No GoodBit with that id on this clip' });
  res.json({ ok: true });
}));

/**
 * Write a GoodBit out as a clip of its own.
 *
 * A job, not an awaited call, and answered with an id the way an export is. A
 * cut re-encodes to land on the frames asked for, which on a 3440 wide
 * recording is tens of seconds, and the trim route gets away with awaiting only
 * because it also streams `trim-progress` at the one clip the page is showing.
 * This produces a new clip rather than replacing one, so it is an export in
 * every way that matters, including that the answer worth waiting for is a
 * `ClipDTO` and `completeJob` already carries one.
 */
clipsRouter.post('/:id/goodbits/:goodBitId/render', asyncHandler(async (req, res) => {
  const clipId = Number(req.params.id);
  const goodBitId = Number(req.params.goodBitId);
  const { mode } = (req.body ?? {}) as { mode?: TrimMode };

  if (mode !== undefined && !['lossless', 'exact', 'compressed'].includes(mode)) {
    return res.status(400).json({ error: 'Unknown trim mode' });
  }

  const repo = AppDataSource.getRepository(GoodBit);
  const goodBit = await repo.findOneBy({ id: goodBitId, clipId });
  if (!goodBit) return res.status(404).json({ error: 'No GoodBit with that id on this clip' });

  const jobId = randomUUID();
  createJob('trim', goodBit.name ?? 'GoodBit', jobId);
  const signal = jobSignal(jobId);

  void new RenderGoodBitAction()
    .execute({
      clipId,
      goodBitId,
      mode,
      signal,
      onProgress: (fraction) => setJobProgress(jobId, fraction * 100, 'Rendering'),
    })
    .then(({ clip }) => completeJob(jobId, ClipDTO.fromEntity(clip)))
    .catch((error: Error) => {
      // A cancel arrives here as an ffmpeg kill; failJob tells the two apart.
      if (!signal?.aborted) console.error('GoodBit render failed:', error);
      failJob(jobId, error.message);
    });

  res.status(202).json({ jobId });
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
  const withTags = await repo.findOne({ where: { id: clip.id }, relations: { tags: true } });
  const dto = withTags ? ClipDTO.fromEntity(withTags) : ClipDTO.fromEntity(clip);
  res.json(dto);
}));

/*
 * Importing files does not come through here, and could not.
 *
 * There was a `POST /import` on this router taking `multipart/form-data`
 * through multer. It was unreachable: `ipc/apiBridge.ts` sets
 * `content-type: application/json` on **every** request it dispatches, so a
 * multipart parser never had a body it could read, and nothing in the renderer
 * called the path in any case.
 *
 * The working route is the `clips:import` IPC handler, which reads the picked
 * paths in main and hands `ImportFilesAction` the bytes. That is the shape the
 * Electron migration settled on, for the reason `services/audio.ts` records:
 * multipart form data cannot cross the contextBridge.
 *
 * `ImportFilesAction` is untouched and still does the work. What went was a
 * second door to it that was painted on.
 */

/**
 * Start a render and answer immediately with its id.
 *
 * A long export used to be awaited here, which meant a render past Cloudflare's
 * 100 second ceiling came back to the client as a 504 even though ffmpeg was
 * still working. The job now runs detached and the client polls for it.
 */
clipsRouter.post('/export', asyncHandler(async (req, res) => {
  const { clips, audio, transitions, outputName, format, framePos, normalizeLoudness } =
    req.body as {
      clips: unknown[];
      audio?: unknown[];
      transitions?: unknown[];
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
      // Unchecked, like everything else off a JSON body. `buildRenderPlan`
      // is the thing that decides what a transition is allowed to be, and it
      // drops what it cannot use rather than failing the render.
      transitions: transitions as never,
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

/**
 * One job, whatever started it.
 *
 * `GET /clips/export/:exportId/status` reads the same map and still works, but
 * it was named when an export was the only long thing in here. A GoodBit render
 * polling a URL with "export" in it invites the reader to look for an export.
 * Declared after `/jobs/list`, which would otherwise match this pattern.
 */
clipsRouter.get('/jobs/:jobId', asyncHandler(async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Unknown job' });
  res.json(jobView(job));
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
  const withTags = await repo.findOne({ where: { id: clip.id }, relations: { tags: true } });
  const dto = withTags ? ClipDTO.fromEntity(withTags) : ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.post('/:id/star', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneOrFail({ where: { id }, relations: { tags: true } });
  clip.starred = true;
  await repo.save(clip);
  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

clipsRouter.post('/:id/unstar', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const repo = AppDataSource.getRepository(Clip);
  const clip = await repo.findOneOrFail({ where: { id }, relations: { tags: true } });
  clip.starred = false;
  await repo.save(clip);
  const dto = ClipDTO.fromEntity(clip);
  res.json(dto);
}));

