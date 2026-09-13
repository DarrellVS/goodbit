import { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Game } from '../entity/Game.js';

/**
 * Folder names the user has hidden from the UI.
 *
 * Hiding is a browsing preference, not a delete: the clips stay on disk, stay in
 * the database and stay published. Only the surfaces that *discover* clips
 * (library list, games list, stats, today, latest) leave them out.
 */
export async function getHiddenGameNames(): Promise<string[]> {
  const games = await AppDataSource.getRepository(Game).find({ where: { hidden: true } });
  return games.map((g) => g.name);
}

/**
 * Drops clips belonging to hidden games from a query. No-op when nothing is hidden.
 */
export async function excludeHiddenGames<T extends object>(
  qb: SelectQueryBuilder<T>,
  alias = 'clip'
): Promise<SelectQueryBuilder<T>> {
  const hidden = await getHiddenGameNames();
  if (hidden.length === 0) return qb;
  return qb.andWhere(`${alias}.game NOT IN (:...hiddenGames)`, { hiddenGames: hidden });
}
