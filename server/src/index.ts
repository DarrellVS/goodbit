import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AppDataSource, VIDEOS_ROOT } from './data-source.js';
import { apiRouter } from './routes/index.js';
import { videoService } from './services/videoService.js';
import { SyncPublisherAction } from './actions/SyncPublisherAction.js';
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


