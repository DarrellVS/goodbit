import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { publisherService } from '../services/publisherService.js';

export interface UnpublishClipInput { id: number; }
export interface UnpublishClipOutput { clip: Clip; }

export class UnpublishClipAction extends BaseAction<UnpublishClipInput, UnpublishClipOutput> {
  async execute(input: UnpublishClipInput): Promise<UnpublishClipOutput> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: input.id });
    await publisherService.unpublish(clip.filename);
    clip.published = false;
    clip.publishedUrl = null;
    await repo.save(clip);
    return { clip };
  }
}


