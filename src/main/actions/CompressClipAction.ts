import { MoveFileToTrashAction } from './MoveFileToTrashAction.js';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { ffmpegCommand, runFfmpeg } from '../services/ffmpegProcess.js';
import {
  decodeArgs,
  detectEncoders,
  probeDurationSec,
  probeVideo,
  shareEncoderArgs,
} from '../services/encoders.js';
import { cancelSource, runLimited } from '../services/mediaQueue.js';
import { planCompression, sameLength, worthKeeping } from '../services/compress.js';
import { publisherService } from '../services/publisherService.js';

export interface CompressClipInput {
  clipId: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface CompressClipOutput {
  /** Whether the file was actually replaced. */
  replaced: boolean;
  beforeBytes: number;
  afterBytes: number;
  /** Set when nothing was replaced, and why. */
  reason?: 'not-smaller' | 'wrong-length';
}

/**
 * Squeeze a clip that is already on disk, in place.
 *
 * The same class of operation as a trim rather than as an export: it replaces
 * the only copy of a moment, so it is careful in the same four ways, and one
 * of them is not in the trim.
 *
 * **Staging, verify, Recycle Bin, rename.** The new file is written beside the
 * original as `.goodbit-compress-…`, which both discovery paths already skip
 * (the watcher ignores a leading dot, the scan globs with `dot: false`) and
 * which `WORKING_FILE` names so an interrupted one is never indexed as a clip.
 * Only once it has been read back does the original go, and it goes to the
 * **Recycle Bin** rather than being overwritten, so a compression somebody
 * regrets is recoverable outside this app. A cancelled job leaves the original
 * untouched, which the ordering gives for nothing.
 *
 * **It is allowed to refuse.** Two checks stand between the encode and the
 * swap, and both are the kind of failure that would otherwise be invisible:
 * a result that is not meaningfully smaller means the clip was already below
 * what the preset aims for, and replacing it would spend quality for nothing;
 * a result of the wrong length is a truncated encode, which is what a full
 * disk leaves behind and which would read as a spectacular saving.
 *
 * **The recording keeps its own date**, in `recordedAt`, and `fileModifiedAt`
 * follows the new file. Not the other way round: forcing the mtime backwards
 * makes it lie about bytes that have just changed, and everything derived is
 * invalidated by comparing against it, so the clip would keep the analysis and
 * the thumbnail of the file it used to be. `TrimAndSwapClipAction` learned
 * this the hard way and this follows it.
 *
 * **Nothing may be reading the file while it is swapped.** On Windows an open
 * handle makes `rename` fail outright with `EBUSY`, and a frame strip is an
 * ffmpeg holding a read handle on exactly this path. Cancelled rather than
 * waited for: every job in that queue is building a cache of a file that is
 * about to become a different one.
 */
export class CompressClipAction extends BaseAction<CompressClipInput, CompressClipOutput> {
  async execute(input: CompressClipInput): Promise<CompressClipOutput> {
    const { clipId, signal, onProgress } = input;
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });

    const before = await fsPromises.stat(clip.filePath);
    const [encoders, info] = await Promise.all([detectEncoders(), probeVideo(clip.filePath)]);

    const ext = path.extname(clip.filePath) || '.mp4';
    const stem = path.basename(clip.filePath, ext);
    const staged = path.join(
      path.dirname(clip.filePath),
      `.goodbit-compress-${stem}-${Date.now()}${ext}`,
    );

    const plan = planCompression({
      info,
      decode: await decodeArgs(encoders, clip.filePath),
      // The share preset, which is what `compressTrims` and `compressPublished`
      // already mean by "compressed". A third independent notion of the word
      // would give the app three answers to one question.
      encoder: shareEncoderArgs(encoders, info),
    });

    try {
      /*
       * Through the queue, like every other ffmpeg here.
       *
       * A batch compress of forty clips would otherwise spawn forty ffmpegs,
       * each holding a few hundred megabytes to decode a 3440x1440 AV1 source.
       * That is the exact failure `mediaQueue` was written for when a few
       * hundred thumbnails scrolled past at once.
       */
      await runLimited(() =>
        runFfmpeg(
          ffmpegCommand(clip.filePath)
            .inputOptions(plan.inputOptions)
            .outputOptions(plan.outputOptions)
            .output(staged),
          { signal, onProgress, durationSec: info.durationSec, timeoutMs: 60 * 60_000 },
        ),
      );

      const after = await fsPromises.stat(staged);
      const stagedDuration = (await probeDurationSec(staged)) ?? 0;

      if (!sameLength(info.durationSec, stagedDuration)) {
        await fsPromises.rm(staged, { force: true }).catch(() => {});
        console.warn(
          `[compress] ${clip.filename}: ${stagedDuration.toFixed(2)}s against ${info.durationSec.toFixed(2)}s, not replacing`,
        );
        return {
          replaced: false,
          beforeBytes: before.size,
          afterBytes: after.size,
          reason: 'wrong-length',
        };
      }

      if (!worthKeeping(before.size, after.size)) {
        await fsPromises.rm(staged, { force: true }).catch(() => {});
        return {
          replaced: false,
          beforeBytes: before.size,
          afterBytes: after.size,
          reason: 'not-smaller',
        };
      }

      /*
       * Published first, for the same reason a trim does it.
       *
       * The bytes behind the public URL are about to be different ones, and
       * `/media` answers a year at the edge. Unpublishing purges it; leaving
       * it would serve the old file for a year and no reload would fix it,
       * because the browser is not the one holding the copy.
       */
      if (clip.published) {
        try {
          await publisherService.unpublish(clip.filename);
          clip.published = false;
          clip.publishedUrl = null;
        } catch (error) {
          console.error(
            `[compress] could not unpublish ${clip.filename}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      await cancelSource(clip.filePath);
      // The bin rather than an overwrite, so a compression somebody regrets is
      // recoverable outside this app. Never `unlink`. Through the one helper
      // that normalises the path: rows store forward slashes, and
      // `shell.trashItem` refuses those with "Failed to parse path", which
      // left every compression in a real library failing after the encode.
      await new MoveFileToTrashAction().execute({ filePath: clip.filePath });
      await fsPromises.rename(staged, clip.filePath);

      const now = await fsPromises.stat(clip.filePath);
      clip.sizeBytes = now.size;
      clip.fileModifiedAt = now.mtime;
      // The recording's own date survives. Its length has not changed, but it
      // is re-probed rather than assumed, because the file is a new one.
      clip.recordedAt = clip.recordedAt ?? before.mtime;
      clip.durationSec = (await probeDurationSec(clip.filePath)) ?? clip.durationSec;
      await repo.save(clip);

      console.log(
        `[compress] ${clip.filename}: ${mb(before.size)} to ${mb(now.size)}, ${percent(before.size, now.size)} saved`,
      );

      return { replaced: true, beforeBytes: before.size, afterBytes: now.size };
    } catch (error) {
      // A half written encode is not something to leave in a game folder, dot
      // prefixed or not.
      await fsPromises.rm(staged, { force: true }).catch(() => {});
      throw error;
    }
  }
}

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;
const percent = (before: number, after: number): string =>
  `${Math.round((1 - after / before) * 100)}%`;
