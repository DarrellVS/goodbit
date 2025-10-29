import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Game } from '../entity/Game.js';
import { Clip } from '../entity/Clip.js';

export interface SyncGamesOutput {
  gamesCreated: number;
}

/**
 * Syncs the Game table with games from clips
 * Creates Game entries for any games that exist in clips but not in Game table
 * This ensures backward compatibility with existing data
 */
export class SyncGamesAction extends BaseAction<void, SyncGamesOutput> {
  async execute(): Promise<SyncGamesOutput> {
    const gameRepo = AppDataSource.getRepository(Game);
    const clipRepo = AppDataSource.getRepository(Clip);

    // Get all unique game names from clips
    const gameNames = await clipRepo
      .createQueryBuilder('clip')
      .select('DISTINCT clip.game', 'game')
      .where('clip.game != :empty', { empty: '' })
      .getRawMany();

    let gamesCreated = 0;

    // Create Game entries for any that don't exist
    for (const { game } of gameNames) {
      const existing = await gameRepo.findOne({ where: { name: game } });
      if (!existing) {
        const newGame = gameRepo.create({
          name: game,
          displayName: null, // No display name initially
        });
        await gameRepo.save(newGame);
        gamesCreated++;
      }
    }

    return { gamesCreated };
  }
}

