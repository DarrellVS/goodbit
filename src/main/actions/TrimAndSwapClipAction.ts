import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { TrimVideoAction, type TrimMode } from './TrimVideoAction.js';
import { publisherService } from '../services/publisherService.js';
import { recordTrim } from '../services/highlights/labels.js';
import { EnsureClipSuggestionsAction } from './EnsureClipSuggestionsAction.js';
import { compressTrims } from '../settings.js';

export type TrimAndSwapInput = {
  clipId: number;
  startSec: number;
  endSec: number;
  /**
   * Absent means the setting decides: `compressed` unless the person turned
   * that off, in which case a lossless copy. This action replaces the original
   * file, so a re-encode is a generation loss on the only copy, which is the
   * point when the file is a hundred megabytes of a ten second moment, and the
   * reason there is a switch.
   */
  mode?: TrimMode;
};

export interface TrimAndSwapOutput {
  /** Where the cut actually landed: a lossless copy snaps back to a keyframe. */
  actualStartSec: number;
  actualEndSec: number;
  mode: TrimMode;
  /** What the file weighs now, so the page can say what the trim did. */
  sizeBytes: number;
}

export class TrimAndSwapClipAction extends BaseAction<TrimAndSwapInput, TrimAndSwapOutput> {
  async execute({
    clipId,
    startSec,
    endSec,
    mode = compressTrims() ? 'compressed' : 'lossless',
  }: TrimAndSwapInput): Promise<TrimAndSwapOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });
    const wasPublished = !!clip.published;

    // What the analysis thought, before the file is replaced and the cache for
    // it becomes a description of something else. This is the only chance to
    // record what was on offer next to what the person actually chose.
    const before = await new EnsureClipSuggestionsAction()
      .execute({ clipId })
      .catch(() => null);
    const dir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath) || '.mp4';
    const tmpPath = path.join(dir, `${path.basename(clip.filePath, ext)}.tmp-${Date.now()}${ext}`);
    const bakPath = `${clip.filePath}.bak`;

    // If currently published, unpublish first so the old content is removed from the CDN
    if (wasPublished) {
      try {
        console.log('Unpublishing', clip.filename);
        await publisherService.unpublish(clip.filename);
      } catch (err) {
        console.error('Error unpublishing', clip.filename, ':', err instanceof Error ? err.message : String(err));
      }
    }

    const trimmed = await new TrimVideoAction().execute({
      inputPath: clip.filePath,
      startSec,
      endSec,
      outputPath: tmpPath,
      mode,
    });

    try { await fsPromises.rm(bakPath, { force: true }); } catch {}
    await fsPromises.rename(clip.filePath, bakPath);
    await fsPromises.rename(tmpPath, clip.filePath);
    try { await fsPromises.rm(bakPath, { force: true }); } catch {}

    const st = await fsPromises.stat(clip.filePath);
    clip.sizeBytes = st.size;
    clip.fileModifiedAt = st.mtime;
    await repo.save(clip);

    // A person just answered the exact question the analysis is trying to
    // answer. Keep the answer; see `entity/HighlightLabel.ts`.
    await recordTrim({
      clipId: clip.id,
      game: clip.game,
      durationSec: before?.durationSec ?? endSec,
      chosenStartSec: trimmed.actualStartSec,
      chosenEndSec: trimmed.actualEndSec,
      suggested: before?.confident ? before.window : null,
      peakZ: before?.peakZ ?? null,
      spreadLu: before?.spreadLu ?? null,
      eventSec: before?.eventSec ?? null,
    });

    // If it was published before, re-publish the updated file and store the new URL
    if (wasPublished) {
      try {
        console.log('Re-publishing', clip.filename);
        const result = await publisherService.publish(clip.filePath, clip.displayName || clip.filename);
        clip.published = true;
        clip.publishedUrl = result.url;
        await repo.save(clip);
      } catch (err) {
        console.error('Error re-publishing', clip.filename, ':', err instanceof Error ? err.message : String(err));
      }
    }

    return { ...trimmed, sizeBytes: st.size };
  }
}
