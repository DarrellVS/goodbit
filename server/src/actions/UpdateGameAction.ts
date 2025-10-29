import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Game } from '../entity/Game.js';
import { Clip } from '../entity/Clip.js';
import { publisherService } from '../services/publisherService.js';

export interface UpdateGameInput {
  name: string; // The folder name (immutable)
  displayName: string | null;
}

export interface UpdateGameOutput {
  game: Game;
  publishedClipsUpdated: number;
}

/**
 * Updates a game's display name
 * Also updates metadata for all published clips of this game
 */
export class UpdateGameAction extends BaseAction<UpdateGameInput, UpdateGameOutput> {
  async execute(input: UpdateGameInput): Promise<UpdateGameOutput> {
    const gameRepo = AppDataSource.getRepository(Game);
    const clipRepo = AppDataSource.getRepository(Clip);

    // Find or create the game entry
    let game = await gameRepo.findOne({ where: { name: input.name } });
    if (!game) {
      game = gameRepo.create({
        name: input.name,
        displayName: input.displayName,
      });
    } else {
      game.displayName = input.displayName;
    }
    await gameRepo.save(game);

    // Find all published clips for this game
    const publishedClips = await clipRepo.find({
      where: {
        game: input.name,
        published: true,
      },
    });

    // Update metadata for all published clips to reflect the new game display name
    let publishedClipsUpdated = 0;
    for (const clip of publishedClips) {
      try {
        // Re-publish with updated metadata (uses the new display name)
        const displayNameToUse = input.displayName || input.name;
        await publisherService.publish(
          clip.filePath,
          clip.displayName || clip.filename,
          displayNameToUse
        );
        publishedClipsUpdated++;
      } catch (error) {
        console.error(`Failed to update metadata for clip ${clip.id}:`, error);
      }
    }

    return {
      game,
      publishedClipsUpdated,
    };
  }
}

