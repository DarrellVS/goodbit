import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AppDataSource, VIDEOS_ROOT } from './data-source.js';
import { apiRouter } from './routes/index.js';
import { videoService } from './services/videoService.js';
import { SyncPublisherAction } from './actions/SyncPublisherAction.js';
import { SyncGamesAction } from './actions/SyncGamesAction.js';
import { SyncClipCreationDatesAction } from './actions/SyncClipCreationDatesAction.js';
import { SyncPublishedClipsMetadataAction } from './actions/SyncPublishedClipsMetadataAction.js';
import { verifyFirebaseToken } from './auth.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { cleanupEmptyFolders } from './utils/cleanupEmptyFolders.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Public health endpoint
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Protect the rest of the API
app.use('/api', verifyFirebaseToken, apiRouter);

// Global error handler (last)
app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await AppDataSource.initialize();
  
  // Clean up empty folders
  try {
    await cleanupEmptyFolders(VIDEOS_ROOT);
  } catch (err) {
    console.error('Folder cleanup failed:', err);
  }
  
  // Initial scan at startup
  try {
    await videoService.scanAndSyncClips();
    console.log('Initial scan completed');
  } catch (err) {
    console.error('Initial scan failed:', err);
  }
  
  // Sync games table with clips (ensures backward compatibility)
  try {
    const syncGamesResult = await new SyncGamesAction().execute();
    console.log('Games sync completed', syncGamesResult);
  } catch (err) {
    console.error('Games sync failed:', err);
  }
  
  // Sync clip creation dates from file birth time
  try {
    const syncDatesResult = await new SyncClipCreationDatesAction().execute();
    console.log('Clip creation dates sync completed', syncDatesResult);
  } catch (err) {
    console.error('Clip creation dates sync failed:', err);
  }
  
  // Sync published clips metadata with current game display names
  try {
    const syncMetadataResult = await new SyncPublishedClipsMetadataAction().execute();
    console.log('Published clips metadata sync completed', syncMetadataResult);
  } catch (err) {
    console.error('Published clips metadata sync failed:', err);
  }
  
  try {
    const syncResult = await new SyncPublisherAction().execute();
    console.log('Publisher sync completed', syncResult);
  } catch (err) {
    console.error('Publisher sync failed:', err);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`VIDEOS_ROOT=${VIDEOS_ROOT}`);
  });
}

start().catch((err) => {
  console.error('Fatal error starting server', err);
  process.exit(1);
});


