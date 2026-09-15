import path from 'node:path';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { GenerateThumbnailAction } from './GenerateThumbnailAction.js';
import { cacheDir as cacheDirFor } from '../services/cachePaths.js';

export type EnsureThumbnailInput = { clip: Clip } | { clipId: number };

export class EnsureThumbnailAction extends BaseAction<EnsureThumbnailInput, string> {
  async execute(input: EnsureThumbnailInput): Promise<string> {
    const clip = 'clip' in input ? input.clip : await AppDataSource.getRepository(Clip).findOneByOrFail({ id: input.clipId });
    const cacheDir = cacheDirFor('thumbnails');
    /*
     * Keyed by where the clip sits in the library, not by where the library
     * sits on disk.
     *
     * The absolute path was the key, so moving the clips folder changed every
     * key at once and the whole library re-derived its thumbnails, having just
     * carried the perfectly good ones across. `relPath` is `Game/clip.mp4`,
     * which is the same before and after a move and is what the library is
     * addressed by anyway.
     *
     * Existing caches are keyed the old way and are regenerated once. That is
     * the last time it happens.
     */
    const identity = clip.relPath || path.relative(VIDEOS_ROOT, clip.filePath) || clip.filePath;
    const key = crypto.createHash('md5').update(identity.split(path.sep).join('/')).digest('hex') + '.jpg';
    const thumbPath = path.join(cacheDir, key);

    let needGenerate = true;
    try {
      const [tStat, vStat] = await Promise.all([
        fsPromises.stat(thumbPath),
        fsPromises.stat(clip.filePath),
      ]);
      if (tStat.mtimeMs >= vStat.mtimeMs && tStat.size > 0) needGenerate = false;
    } catch {}

    if (needGenerate) {
      await new GenerateThumbnailAction().execute({ inputPath: clip.filePath, outputPath: thumbPath, seekSec: 1, quality: 4 });
    }
    return thumbPath;
  }
}


