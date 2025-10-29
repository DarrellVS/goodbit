import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { publisherService } from '../services/publisherService.js';

export interface PublishClipInput { id: number; }
export interface PublishClipOutput { clip: Clip; }

export class PublishClipAction extends BaseAction<PublishClipInput, PublishClipOutput> {
  async execute(input: PublishClipInput): Promise<PublishClipOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: input.id });
    const result = await publisherService.publish(clip.filePath, clip.displayName || clip.filename, clip.game);
    clip.published = true;
    clip.publishedUrl = result.url;
    await repo.save(clip);
    return { clip };
  }
}


