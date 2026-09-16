import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { GoodBit } from '../entity/GoodBit.js';
import { TrimVideoAction, type TrimMode } from './TrimVideoAction.js';
import { renderBasename } from '../services/goodBits.js';
import { probeDurationSec } from '../services/encoders.js';
import { compressTrims } from '../settings.js';
import { announce } from '../startup.js';

export interface RenderGoodBitInput {
  clipId: number;
  goodBitId: number;
  /**
   * Absent means the trim setting decides, and both of its answers land on the
   * frames asked for. See the note in `execute`.
   */
  mode?: TrimMode;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface RenderGoodBitOutput {
  /** The new row, which is a normal clip in every way. */
  clip: Clip;
  /** The GoodBit it came from, still on its own recording, unchanged. */
  goodBit: GoodBit;
}

/**
 * Write a GoodBit out as a clip of its own, leaving the recording alone.
 *
 * **This is a trim that does not swap**, and the difference is the whole point.
 * `TrimAndSwapClipAction` writes the cut beside the original, renames the
 * original to `.goodbit-bak-…`, renames the cut over it, and then deletes the
 * backup: one moment survives and the rest of the recording is gone. That is
 * still the right action for "cut this recording down and give me the disk
 * back", and it is the wrong one for a clip with two good bits in it.
 *
 * So the cut lands at a new path and the source keeps every GoodBit it had.
 * The result is a clip like any other, in the same game folder, indexed the
 * same way, publishable and editable, which is what keeps disk authoritative:
 * the alternative is a second kind of clip that exists only in the database and
 * that `publisher/` would have nothing to serve.
 *
 * Rendering the same GoodBit twice gives two files. There is deliberately no
 * link from the render back to the GoodBit: a clip is a file on disk, and a row
 * saying "this file is really part of that one" would be a claim the scan
 * cannot check and the Recycle Bin cannot honour.
 */
export class RenderGoodBitAction extends BaseAction<RenderGoodBitInput, RenderGoodBitOutput> {
  async execute(input: RenderGoodBitInput): Promise<RenderGoodBitOutput> {
    const { clipId, goodBitId, signal, onProgress } = input;
    const goodBitRepo = AppDataSource.getRepository(GoodBit);
    const clipRepo = AppDataSource.getRepository(Clip);

    const goodBit = await goodBitRepo.findOneByOrFail({ id: goodBitId, clipId });
    const source = await clipRepo.findOneByOrFail({ id: clipId });

    const dir = path.dirname(source.filePath);
    const ext = path.extname(source.filePath) || '.mp4';
    const stem = path.basename(source.filePath, ext);

    const finalPath = await this.freePath(
      dir,
      renderBasename({
        stem,
        name: goodBit.name,
        startSec: goodBit.startSec,
        endSec: goodBit.endSec,
      }),
      ext,
    );

    /*
     * Written to a dot-prefixed name and renamed into place at the end.
     *
     * An exact cut re-encodes, which on a 3440 wide recording is tens of
     * seconds, and this file is being written into a folder the watcher is
     * looking at. `TrimAndSwapClipAction` learned this the hard way: a file
     * ending in `.mp4` sitting in a game folder looks exactly like a new
     * recording, and the library gained a second clip dated today for the
     * duration of every trim. A leading dot is the one thing both discovery
     * paths already agree to skip, the watcher ignores any basename starting
     * with one and the scan globs with `dot: false`.
     *
     * The rename is within one directory, so it is atomic and instant: the file
     * is never half present at its final path, and `awaitWriteFinish` gives
     * this action seconds to write the row before the watcher would look.
     */
    const stagedPath = path.join(dir, `.goodbit-render-${Date.now()}${ext}`);

    /*
     * The same rule a trim follows, for the same reason.
     *
     * Both defaults are frame accurate, and `compressTrims` only decides how
     * hard the result is squeezed. It is off by default because a trim replaces
     * the only copy of that moment; nothing is at stake here, since the
     * recording is still on disk either way, but somebody who has said they
     * want cuts squeezed means this cut too, and a second setting for the same
     * question is worse than reusing the answer.
     */
    const mode: TrimMode = input.mode ?? (compressTrims() ? 'compressed' : 'exact');

    try {
      await new TrimVideoAction().execute({
        inputPath: source.filePath,
        startSec: goodBit.startSec,
        endSec: goodBit.endSec,
        outputPath: stagedPath,
        mode,
        signal,
        onProgress,
      });
    } catch (error) {
      // A half written render is not something to leave in a game folder, even
      // hidden: nothing indexes it, so nothing would ever clean it up either.
      await fsPromises.rm(stagedPath, { force: true }).catch(() => {});
      throw error;
    }

    await this.renameWhenFree(stagedPath, finalPath);

    const stat = await fsPromises.stat(finalPath);
    const filename = path.basename(finalPath);

    const clip = clipRepo.create({
      filePath: finalPath,
      relPath: path.relative(VIDEOS_ROOT, finalPath),
      game: source.game,
      filename,
      extension: ext.slice(1),
      sizeBytes: stat.size,
      durationSec: (await probeDurationSec(finalPath)) ?? goodBit.endSec - goodBit.startSec,
      /*
       * The date of the recording, not of the render.
       *
       * `fileModifiedAt` tracks the file and has to: every derived thing, the
       * analysis cache and the `?v=` that stops the browser reusing a decoded
       * picture, is invalidated by comparing against it. `recordedAt` is the
       * other question, and a render that answered it with `Date.now()` would
       * file an August moment under today. It is written here rather than left
       * to the scan because the scan only fills it in when it is empty, and by
       * then the only date it has to fill it in from is this file's own.
       */
      fileModifiedAt: stat.mtime,
      recordedAt: source.recordedAt ?? source.fileModifiedAt,
      // The GoodBit's name if it has one, so the library shows what somebody
      // called it. The filename already carries it, but `displayName` is the
      // field the library reads and clips are never renamed to fix that.
      displayName: goodBit.name,
      published: false,
      starred: false,
    });

    const saved = await clipRepo.save(clip);

    // The row exists and is openable, which is what this event means. Without
    // it the clip appears in the library whenever something else asks for a
    // refresh, which on a quiet app is not until the next reconciliation sweep.
    announce({ type: 'clip-ready', clipId: saved.id, game: saved.game, filePath: saved.filePath });

    return { clip: saved, goodBit };
  }

  /** `name.mp4`, or `name (2).mp4`, or the first one after that nothing holds. */
  private async freePath(dir: string, base: string, ext: string): Promise<string> {
    for (let counter = 1; ; counter += 1) {
      const candidate = path.join(dir, counter === 1 ? `${base}${ext}` : `${base} (${counter})${ext}`);
      try {
        await fsPromises.access(candidate);
      } catch {
        return candidate;
      }
    }
  }

  /**
   * Rename, and keep trying for a moment.
   *
   * The same `EBUSY` a swap hits, from a smaller set of causes: nothing knows
   * this path yet, but a virus scanner opening the file the instant ffmpeg
   * closes it is enough on Windows, and it clears in milliseconds. Fewer
   * attempts than `TrimAndSwapClipAction` needs, because there is no `<video>`
   * and no frame strip holding the other end.
   */
  private async renameWhenFree(from: string, to: string): Promise<void> {
    const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES']);

    for (let attempt = 0; ; attempt += 1) {
      try {
        await fsPromises.rename(from, to);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? '';
        if (!BUSY.has(code) || attempt >= 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}
