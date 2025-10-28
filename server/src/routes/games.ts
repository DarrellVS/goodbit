import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { GameDTO } from '../../../shared/index.js';

export const gamesRouter = express.Router();

gamesRouter.get('/', asyncHandler(async (_req, res) => {
  const repo = AppDataSource.getRepository(Clip);
  const rows = await repo
    .createQueryBuilder('clip')
    .select('clip.game', 'game')
    .addSelect('COUNT(*)', 'clipCount')
    .groupBy('clip.game')
    .orderBy('clipCount', 'DESC')
    .getRawMany();
  const dtos = rows.map(row => GameDTO.fromQueryResult(row));
  res.json(dtos);
}));


