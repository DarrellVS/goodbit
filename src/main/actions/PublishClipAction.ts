import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { publisherService } from '../services/publisherService.js';
import { CompressVideoAction } from './CompressVideoAction.js';
import { compressPublished } from '../settings.js';

export interface PublishClipInput {
  id: number;
  /**
   * Upload a share-sized copy and leave the file on disk as it is.
   *
   * Left out, the compress-published setting decides — which is what the plain
   * Publish button does. Passed explicitly, it overrides that for this one
   * upload, which is how the menu offers the other choice.
   */
  compress?: boolean;
}
export interface PublishClipOutput { clip: Clip; }

export class PublishClipAction extends BaseAction<PublishClipInput, PublishClipOutput> {
  async execute(input: PublishClipInput): Promise<PublishClipOutput> {
    const clipRepo = AppDataSource.getRepository(Clip);
    const gameRepo = AppDataSource.getRepository(Game);

    const clip = await clipRepo.findOneByOrFail({ id: input.id });

    // Get game display name if available
    const game = await gameRepo.findOne({ where: { name: clip.game } });
    const gameDisplayName = game?.displayName || clip.game;

    const compress = input.compress ?? compressPublished();
    const result = compress
      ? await this.publishCompressed(clip, gameDisplayName)
      : await publisherService.publish(clip.filePath, clip.displayName || clip.filename, gameDisplayName);

    clip.published = true;
    clip.publishedUrl = result.url;
    await clipRepo.save(clip);
    return { clip };
  }

  /**
   * The copy is written under the clip's own filename, in a scratch folder:
   * the publisher stores by upload name and `unpublish` asks for it by
   * `clip.filename`, so a copy under any other name could not be taken down.
   */
  private async publishCompressed(clip: Clip, gameDisplayName: string) {
    const scratch = await fsPromises.mkdtemp(path.join(tmpdir(), 'goodbit-publish-'));
    const copy = path.join(scratch, clip.filename);
    try {
      await new CompressVideoAction().execute({ inputPath: clip.filePath, outputPath: copy });
      return await publisherService.publish(copy, clip.displayName || clip.filename, gameDisplayName);
    } finally {
      await fsPromises.rm(scratch, { recursive: true, force: true }).catch(() => {});
    }
  }
}
