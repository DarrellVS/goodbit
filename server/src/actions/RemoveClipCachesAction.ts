import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { BaseAction } from './BaseAction.js';
import { VIDEOS_ROOT } from '../data-source.js';

export type RemoveClipCachesInput = { filePath: string };

/**
 * Removes cached thumbnail and frame-strip artifacts for a given clip file path.
 * Best-effort; ignores missing files.
 */
export class RemoveClipCachesAction extends BaseAction<RemoveClipCachesInput, void> {
  async execute({ filePath }: RemoveClipCachesInput): Promise<void> {
    const thumbsDir = path.join(VIDEOS_ROOT, '.filmpje-cache', 'thumbnails');
    const framesDir = path.join(VIDEOS_ROOT, '.filmpje-cache', 'frames');
    const thumbKey = crypto.createHash('md5').update(filePath).digest('hex') + '.jpg';
    const stripKey = crypto.createHash('md5').update(filePath + ':strip').digest('hex') + '.jpg';
    const thumbPath = path.join(thumbsDir, thumbKey);
    const stripPath = path.join(framesDir, stripKey);
    await Promise.all([
      fsPromises.rm(thumbPath, { force: true }).catch(() => {}),
      fsPromises.rm(stripPath, { force: true }).catch(() => {}),
    ]);
  }
}


