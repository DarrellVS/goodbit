import crypto from 'node:crypto';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { cacheDirPath } from './cachePaths.js';
import { Clip } from '../entity/Clip.js';
import { EnsureThumbnailAction } from '../actions/EnsureThumbnailAction.js';
import { EnsureFrameStripAction } from '../actions/EnsureFrameStripAction.js';
import { TrimAndSwapClipAction, type TrimAndSwapOutput } from '../actions/TrimAndSwapClipAction.js';
import type { TrimMode } from '../actions/TrimVideoAction.js';
import type { ClipAudioSelection } from '@shared/index.js';
import { ScanAndSyncClipsAction, type ScanResult } from '../actions/ScanAndSyncClipsAction.js';
import { GetClipMetaAction, type ClipMeta } from '../actions/GetClipMetaAction.js';
import { OpenClipAction } from '../actions/OpenClipAction.js';
import { MoveFileToTrashAction } from '../actions/MoveFileToTrashAction.js';

/**
 * VideoService orchestrates video-related operations using actions and helpers.
 * Singleton export ensures a single coordination point across routes.
 */
class VideoService {
  async trimAndSwapClip(
    id: number,
    startSec: number,
    endSec: number,
    mode?: TrimMode,
    audio?: ClipAudioSelection[],
  ): Promise<TrimAndSwapOutput> {
    const result = await new TrimAndSwapClipAction().execute({
      clipId: id,
      startSec,
      endSec,
      mode,
      audio,
    });
    // After swapping, invalidate caches so they regenerate on next request
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    await this.removeClipCaches(clip.filePath);
    return result;
  }

  async ensureThumbnail(clip: Clip): Promise<string> {
    return await new EnsureThumbnailAction().execute({ clip });
  }

  async ensureFrameStrip(clip: Clip): Promise<string> {
    return await new EnsureFrameStripAction().execute({ clip });
  }

  /**
   * One scan at a time, and one more if anything asked while it ran.
   *
   * Nine things start a scan: boot, the six hourly sweep, the tray item, the
   * header button, `POST /scan`, a watcher add, a watcher unlink, a boot step
   * and every clip GoodBit files for itself. None of them knew about each
   * other, and two scans at once is not a waste, it is an error: both read the
   * same folder, both find the same file with no row, and both insert it.
   *
   *   SQLITE_CONSTRAINT: UNIQUE constraint failed: clip.filePath
   *
   * `reconcile()` swallows that and logs, so the watcher path lost a clip
   * quietly; `POST /scan` answered 500. Reachable by pressing Rescan while a
   * replay is being filed, or by saving two replays inside one scan, which on
   * a library of a few hundred clips is a second or so wide.
   *
   * Coalesced rather than queued. A caller arriving mid-scan does not want
   * that scan's answer, because it may have started before their file existed,
   * so one follow-up run is scheduled and every waiter gets its result. Any
   * number of callers during a scan still means exactly one more scan, which
   * is the same "collapse duplicate work" rule `mediaQueue.ts` applies to
   * ffmpeg.
   */
  private scanInFlight: Promise<ScanResult> | null = null;
  private scanAgain = false;

  async scanAndSyncClips(): Promise<ScanResult> {
    if (this.scanInFlight) {
      this.scanAgain = true;
      return await this.scanInFlight;
    }

    this.scanInFlight = (async () => {
      try {
        let result = await new ScanAndSyncClipsAction().execute();

        // Drains rather than loops for ever: each pass clears the flag before
        // running, so only work asked for after it started schedules another.
        while (this.scanAgain) {
          this.scanAgain = false;
          result = await new ScanAndSyncClipsAction().execute();
        }

        return result;
      } finally {
        this.scanInFlight = null;
        this.scanAgain = false;
      }
    })();

    return await this.scanInFlight;
  }

  async removeClipCaches(filePath: string): Promise<void> {
    try {
      const thumbsDir = cacheDirPath('thumbnails');
      const framesDir = cacheDirPath('frames');
      const thumbKey = crypto.createHash('md5').update(filePath).digest('hex') + '.jpg';
      const stripKey = crypto.createHash('md5').update(filePath + ':strip').digest('hex') + '.jpg';
      const thumbPath = path.join(thumbsDir, thumbKey);
      const stripPath = path.join(framesDir, stripKey);
      await Promise.all([
        fsPromises.rm(thumbPath, { force: true }).catch(() => {}),
        fsPromises.rm(stripPath, { force: true }).catch(() => {}),
      ]);
    } catch {}
  }

  async getClipMeta(id: number): Promise<ClipMeta> {
    return await new GetClipMetaAction().execute({ clipId: id });
  }

  async openClip(id: number): Promise<void> {
    await new OpenClipAction().execute({ clipId: id });
  }

  /**
   * A file that is already gone is not an obstacle to forgetting the clip.
   *
   * `shell.trashItem` throws on a path that does not exist, and the delete
   * route trashes before it removes the row, so a clip whose file had been
   * moved or renamed outside the app could never be deleted from inside it:
   * every attempt failed on the file and left the row where it was.
   */
  async moveClipFileToTrash(filePath: string): Promise<void> {
    try {
      await fsPromises.access(filePath);
    } catch {
      console.warn('[delete] file already gone, removing the row only:', filePath);
      return;
    }
    await new MoveFileToTrashAction().execute({ filePath });
  }
}

export const videoService = new VideoService();


