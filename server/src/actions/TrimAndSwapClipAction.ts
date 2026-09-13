import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { TrimVideoAction, type TrimMode } from './TrimVideoAction.js';
import { publisherService } from '../services/publisherService.js';

export type TrimAndSwapInput = {
  clipId: number;
  startSec: number;
  endSec: number;
  /**
   * Defaults to a lossless copy. This action replaces the original file, so
   * re-encoding is a generation loss on the only copy — `exact` is opt-in.
   */
  mode?: TrimMode;
};

export interface TrimAndSwapOutput {
  /** Where the cut actually landed: a lossless copy snaps back to a keyframe. */
  actualStartSec: number;
  actualEndSec: number;
  mode: TrimMode;
}

export class TrimAndSwapClipAction extends BaseAction<TrimAndSwapInput, TrimAndSwapOutput> {
  async execute({
    clipId,
    startSec,
    endSec,
    mode = 'lossless',
  }: TrimAndSwapInput): Promise<TrimAndSwapOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });
    const wasPublished = !!clip.published;
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

    return trimmed;
  }
}
