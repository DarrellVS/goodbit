import path from 'node:path';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { BaseAction } from './BaseAction.js';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { GenerateFrameStripAction } from './GenerateFrameStripAction.js';
import { onceLimited } from '../services/mediaQueue.js';
import { cacheDir as cacheDirFor } from '../services/cachePaths.js';

export type EnsureFrameStripInput = { clip: Clip } | { clipId: number };

export class EnsureFrameStripAction extends BaseAction<EnsureFrameStripInput, string> {
  async execute(input: EnsureFrameStripInput): Promise<string> {
    const clip = 'clip' in input ? input.clip : await AppDataSource.getRepository(Clip).findOneByOrFail({ id: input.clipId });
    const cacheDir = cacheDirFor('frames');
    const key = crypto.createHash('md5').update(clip.filePath + ':strip').digest('hex') + '.jpg';
    const stripPath = path.join(cacheDir, key);

    let need = true;
    try {
      const [s, v] = await Promise.all([fsPromises.stat(stripPath), fsPromises.stat(clip.filePath)]);
      if (s.mtimeMs >= v.mtimeMs && s.size > 0) need = false;
    } catch {}

    if (need) {
      // Through the same queue as the thumbnails: a strip is ten frames and
      // the trim page asks for one per clip it shows.
      /*
       * Timed, because the difference between the recipe and the experience
       * was twenty five seconds and nothing said where it went. `waited` is
       * time spent queued behind other work; `took` is the ffmpeg itself.
       */
      const asked = Date.now();
      let started = asked;

      await onceLimited(stripPath, (signal) => {
        started = Date.now();
        return new GenerateFrameStripAction().execute({
          inputPath: clip.filePath,
          outputPath: stripPath,
          frames: 10,
          scale: 320,
          signal,
        });
      },
        // What the job reads, so a trim knows to wait for it.
        clip.filePath,
      );

      console.log(
        `[strip] ${clip.filename}: waited ${started - asked}ms, took ${Date.now() - started}ms`,
      );
    }
    return stripPath;
  }
}


