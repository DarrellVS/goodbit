import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Game } from '../entity/Game.js';
import { Clip } from '../entity/Clip.js';
import { publisherService } from '../services/publisherService.js';

export interface UpdateGameInput {
  name: string; // The folder name (immutable)
  displayName?: string | null;
  hidden?: boolean;
}

export interface UpdateGameOutput {
  game: Game;
  publishedClipsUpdated: number;
}

/**
 * Updates a game's display name and/or its hidden flag.
 *
 * A display name change also re-pushes metadata for every published clip of this
 * game so Discord embeds follow. Hiding is UI-only: it never touches the files
 * and never unpublishes anything, so it skips that work.
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
        displayName: null,
        hidden: false,
      });
    }

    const displayNameChanged =
      input.displayName !== undefined && input.displayName !== game.displayName;

    if (input.displayName !== undefined) game.displayName = input.displayName;
    if (input.hidden !== undefined) game.hidden = input.hidden;

    await gameRepo.save(game);

    if (!displayNameChanged) {
      return { game, publishedClipsUpdated: 0 };
    }

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
        const displayNameToUse = game.displayName || input.name;
        await publisherService.publish(
          clip.filePath,
          clip.displayName || clip.filename,
          displayNameToUse
        );
        publishedClipsUpdated++;
      } catch (error) {
        console.error(`Failed to update metadata for clip ${clip.id}:`, error instanceof Error ? error.message : String(error));
      }
    }

    return {
      game,
      publishedClipsUpdated,
    };
  }
}
