import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { publisherService } from '../services/publisherService.js';

export interface PublishClipInput { id: number; }
export interface PublishClipOutput { clip: Clip; }

export class PublishClipAction extends BaseAction<PublishClipInput, PublishClipOutput> {
  async execute(input: PublishClipInput): Promise<PublishClipOutput> {
    const clipRepo = AppDataSource.getRepository(Clip);
    const gameRepo = AppDataSource.getRepository(Game);
    
    const clip = await clipRepo.findOneByOrFail({ id: input.id });
    
    // Get game display name if available
    const game = await gameRepo.findOne({ where: { name: clip.game } });
    const gameDisplayName = game?.displayName || clip.game;
    
    const result = await publisherService.publish(
      clip.filePath, 
      clip.displayName || clip.filename, 
      gameDisplayName
    );
    
    clip.published = true;
    clip.publishedUrl = result.url;
    await clipRepo.save(clip);
    return { clip };
  }
}


