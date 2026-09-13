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
    const key = crypto.createHash('md5').update(clip.filePath).digest('hex') + '.jpg';
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


