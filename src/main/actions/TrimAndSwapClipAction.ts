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
import { probeDurationSec } from '../services/encoders.js';
import { announce } from '../startup.js';

export type TrimAndSwapInput = {
  clipId: number;
  startSec: number;
  endSec: number;
  /**
   * Absent means the setting decides, and both of its answers land on the exact
   * frames asked for. This action replaces the original file, so the only
   * question left is how hard the result is squeezed: `compressed` re-encodes
   * to share size, `exact` keeps the picture close to the recording.
   */
  mode?: TrimMode;
};

export interface TrimAndSwapOutput {
  /**
   * Where the cut landed, which is the range that was asked for. Only a caller
   * that explicitly asks for `lossless` gets something else, because a stream
   * copy has to begin at a keyframe.
   */
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
    // Both defaults are frame accurate. A stream copy cannot be: it has to
    // begin at a keyframe, so asking for 4.5s to 12.8s quietly produced a file
    // that started at 0. The cut now lands exactly where it was asked to, and
    // the setting only chooses how hard the result is squeezed.
    mode = compressTrims() ? 'compressed' : 'exact',
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

    /*
     * Say how far along the cut is.
     *
     * An exact trim re-encodes, and on a 3440 wide recording that is tens of
     * seconds. The button used to spin and say "Trimming" with no idea whether
     * it was a moment away or half a minute.
     */
    const say = (stage: 'cutting' | 'done' | 'failed', percent: number): void =>
      announce({ type: 'trim-progress', clipId: clip.id, stage, percent });

    say('cutting', 0);

    let trimmed;
    try {
      trimmed = await new TrimVideoAction().execute({
        inputPath: clip.filePath,
        startSec,
        endSec,
        outputPath: tmpPath,
        mode,
        onProgress: (fraction) => say('cutting', Math.round(fraction * 100)),
      });
    } catch (error) {
      say('failed', 0);
      throw error;
    }

    try { await fsPromises.rm(bakPath, { force: true }); } catch {}
    await fsPromises.rename(clip.filePath, bakPath);
    await fsPromises.rename(tmpPath, clip.filePath);
    try { await fsPromises.rm(bakPath, { force: true }); } catch {}

    /*
     * `fileModifiedAt` follows the new file, and `recordedAt` is left alone.
     *
     * The first attempt at keeping a trimmed clip in its own day forced the
     * file's mtime back to the recording date, which made the mtime lie about
     * bytes that had just changed. Everything derived is invalidated by
     * comparing against it, so the clip kept its old analysis and the browser
     * went on playing the video it had already cached.
     */
    const st = await fsPromises.stat(clip.filePath);
    clip.sizeBytes = st.size;
    clip.fileModifiedAt = st.mtime;
    clip.recordedAt = clip.recordedAt ?? st.mtime;
    // The clip is a different length now, and the library shows that on every
    // tile. Left alone it kept advertising the length of the recording it used
    // to be.
    clip.durationSec = (await probeDurationSec(clip.filePath)) ?? trimmed.actualEndSec - trimmed.actualStartSec;
    await repo.save(clip);

    say('done', 100);

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
