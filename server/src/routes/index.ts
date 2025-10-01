import express from 'express';
import { clipsRouter } from './clips.js';
import { gamesRouter } from './games.js';
import { tagsRouter } from './tags.js';
import { statsRouter } from './stats.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { videoService } from '../services/videoService.js';

export const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/clips', clipsRouter);
apiRouter.use('/games', gamesRouter);
apiRouter.use('/tags', tagsRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.post('/scan', asyncHandler(async (_req, res) => {
  const result = await videoService.scanAndSyncClips();
  res.json(result);
}));


