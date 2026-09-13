import express from 'express';
import { clipsRouter } from './clips.js';
import { gamesRouter } from './games.js';
import { tagsRouter } from './tags.js';
import { statsRouter } from './stats.js';
import { collectionsRouter } from './collections.js';
import { audioRouter } from './audio.js';
import { projectsRouter } from './projects.js';
import { tagPatternsRouter } from './tagPatterns.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { videoService } from '../services/videoService.js';
import { getLanEndpoints } from '../utils/networkInfo.js';
import { resolveClientDist } from '../utils/clientDist.js';

export const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));

// Lets the client discover a LAN address it can reach this server at directly,
// so media never has to round-trip the internet while the user is at home.
apiRouter.get('/local-info', (_req, res) => {
  const port = Number(process.env.PORT || 4000);
  res.json({
    port,
    servesClient: resolveClientDist() !== null,
    endpoints: getLanEndpoints(port),
  });
});
apiRouter.use('/clips', clipsRouter);
apiRouter.use('/games', gamesRouter);
apiRouter.use('/tags', tagsRouter);
apiRouter.use('/stats', statsRouter);
apiRouter.use('/collections', collectionsRouter);
apiRouter.use('/audio', audioRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/tag-patterns', tagPatternsRouter);
apiRouter.post('/scan', asyncHandler(async (_req, res) => {
  const result = await videoService.scanAndSyncClips();
  res.json(result);
}));


