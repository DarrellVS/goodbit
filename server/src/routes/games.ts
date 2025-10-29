import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { Game } from '../entity/Game.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { GameDTO } from '../../../shared/index.js';
import { UpdateGameAction } from '../actions/UpdateGameAction.js';

export const gamesRouter = express.Router();

gamesRouter.get('/', asyncHandler(async (_req, res) => {
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
  
  // Get display names from Game table
  const games = await gameRepo.find();
  const displayNameMap = new Map(games.map(g => [g.name, g.displayName]));
  
  // Combine data
  const dtos = rows.map(row => {
    const dto = GameDTO.fromQueryResult(row);
    dto.displayName = displayNameMap.get(row.game) ?? null;
    return dto;
  });
  
  res.json(dtos);
}));

gamesRouter.patch('/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { displayName } = req.body;

  const action = new UpdateGameAction();
  const result = await action.execute({
    name,
    displayName: displayName ?? null,
  });

  res.json({
    game: result.game,
    publishedClipsUpdated: result.publishedClipsUpdated,
  });
}));


