import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { GameDTO } from '@shared/index.js';
import { UpdateGameAction } from '../actions/UpdateGameAction.js';

export const gamesRouter = express.Router();

gamesRouter.get('/', asyncHandler(async (req, res) => {
  // Hidden games are left out by default. The sidebar, filters and pickers all
  // read this list. `?includeHidden=true` is for the settings screen that manages
  // the hiding itself.
  const includeHidden = req.query.includeHidden === 'true';

  const clipRepo = AppDataSource.getRepository(Clip);
  const gameRepo = AppDataSource.getRepository(Game);

  // Get clip counts per game
  const rows = await clipRepo
    .createQueryBuilder('clip')
    .select('clip.game', 'game')
    .addSelect('COUNT(*)', 'clipCount')
    .groupBy('clip.game')
    .orderBy('clipCount', 'DESC')
    .getRawMany();

  // Get display names and hidden flags from Game table
  const games = await gameRepo.find();
  const gameMap = new Map(games.map(g => [g.name, g]));

  // Combine data
  const dtos = rows
    .filter(row => includeHidden || !gameMap.get(row.game)?.hidden)
    .map(row => {
      const dto = GameDTO.fromQueryResult(row);
      const game = gameMap.get(row.game);
      dto.displayName = game?.displayName ?? null;
      dto.hidden = game?.hidden ?? false;
      return dto;
    });

  res.json(dtos);
}));

gamesRouter.patch('/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { displayName, hidden } = req.body as { displayName?: string | null; hidden?: boolean };

  if (hidden !== undefined && typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'hidden must be a boolean' });
  }

  const action = new UpdateGameAction();
  const result = await action.execute({
    name,
    // Absent key = leave alone. `null` is a real value here (clears the name).
    ...('displayName' in req.body ? { displayName: displayName ?? null } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
  });

  res.json({
    game: result.game,
    publishedClipsUpdated: result.publishedClipsUpdated,
  });
}));
