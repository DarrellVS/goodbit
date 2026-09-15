import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Game } from '../entity/Game.js';
import { Clip } from '../entity/Clip.js';
import { appIdForGame } from '../services/steam/appIds.js';

export interface SyncGamesOutput {
  gamesCreated: number;
  /** How many games were matched to a Steam appid this run. */
  steamMatched: number;
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
    let steamMatched = 0;

    // Create Game entries for any that don't exist
    for (const { game } of gameNames) {
      let existing = await gameRepo.findOne({ where: { name: game } });
      if (!existing) {
        const newGame = gameRepo.create({
          name: game,
          displayName: null, // No display name initially
          hidden: false,
        });
        existing = await gameRepo.save(newGame);
        gamesCreated++;
      }

      /*
       * Matched here because this already walks every game once a boot, and
       * because the answer should be decided in one place rather than by
       * whatever screen happens to render first.
       *
       * Only when it is not already known and nobody has said otherwise: a
       * person who corrected a wrong match should not have to correct it
       * again on the next scan.
       */
      if (!existing.steamAppId && !existing.steamAppIdLocked) {
        const appId = await appIdForGame(game);
        if (appId) {
          await gameRepo.update(existing.name, { steamAppId: appId });
          steamMatched++;
        }
      }
    }

    return { gamesCreated, steamMatched };
  }
}

