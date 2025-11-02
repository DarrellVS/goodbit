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

// Helper to get client IP
function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.socket.remoteAddress || '';
}

// Public endpoints (no auth required)
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/clips/today/count', async (_req, res) => {
  try {
    const { Clip } = await import('./entity/Clip.js');
    const repo = AppDataSource.getRepository(Clip);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const count = await repo
      .createQueryBuilder('clip')
      .where('clip.createdAt >= :today', { today: today.toISOString() })
      .getCount();
    
    res.json({ count, date: today.toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/rescan', async (req, res) => {
  console.log(req);
  
  const clientIp = getClientIp(req);
  const allowedIp = '::1';
  
  // Check if request is from allowed IP
  if (clientIp !== allowedIp) {
    console.log(`❌ Unauthorized rescan attempt from IP: ${clientIp}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    console.log(`🔄 Manual rescan triggered from IP: ${clientIp}`);
    const scanResult = await videoService.scanAndSyncClips();
    console.log(`📂 Manual scan completed: +${scanResult.added} ~${scanResult.updated} -${scanResult.removed} (total: ${scanResult.total})`);
    res.json(scanResult);
  } catch (error) {
    console.error('❌ Manual rescan failed:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Rescan failed' });
  }
});

// Protect the rest of the API
app.use('/api', verifyFirebaseToken, apiRouter);

// Global error handler (last)
app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await AppDataSource.initialize();
  
  console.log('\n🎬 Filmpje Server Starting...\n');
  
  // Clean up empty folders
  try {
    await cleanupEmptyFolders(VIDEOS_ROOT);
  } catch (err) {
    console.error('❌ Folder cleanup failed:', err instanceof Error ? err.message : String(err));
  }
  
  // Initial scan at startup
  try {
    const scanResult = await videoService.scanAndSyncClips();
    console.log('📂 Initial scan completed');
    console.log(`   added: ${scanResult.added}`);
    console.log(`   updated: ${scanResult.updated}`);
    console.log(`   removed: ${scanResult.removed}`);
    console.log(`   total: ${scanResult.total}\n`);
  } catch (err) {
    console.error('❌ Initial scan failed:', err instanceof Error ? err.message : String(err));
  }
  
  // Sync games table with clips (ensures backward compatibility)
  try {
    const syncGamesResult = await new SyncGamesAction().execute();
    console.log('🎮 Games sync completed');
    console.log(`   created: ${syncGamesResult.gamesCreated}\n`);
  } catch (err) {
    console.error('❌ Games sync failed:', err instanceof Error ? err.message : String(err));
  }
  
  // Sync clip creation dates from file birth time
  try {
    const syncDatesResult = await new SyncClipCreationDatesAction().execute();
    console.log('📅 Clip creation dates sync completed');
    console.log(`   synced: ${syncDatesResult.synced}`);
    console.log(`   skipped: ${syncDatesResult.skipped}`);
    console.log(`   errors: ${syncDatesResult.errors}\n`);
  } catch (err) {
    console.error('❌ Clip creation dates sync failed:', err instanceof Error ? err.message : String(err));
  }
  
  // Sync published clips metadata with current game display names
  try {
    const syncMetadataResult = await new SyncPublishedClipsMetadataAction().execute();
    console.log('🔄 Published clips metadata sync completed');
    console.log(`   synced: ${syncMetadataResult.synced}`);
    console.log(`   errors: ${syncMetadataResult.errors}\n`);
  } catch (err) {
    console.error('❌ Published clips metadata sync failed:', err instanceof Error ? err.message : String(err));
  }
  
  try {
    const syncResult = await new SyncPublisherAction().execute();
    console.log('☁️  Publisher sync completed');
    console.log(`   uploaded: ${syncResult.uploaded}`);
    console.log(`   removed: ${syncResult.removed}`);
    console.log(`   updated: ${syncResult.updatedFlags}\n`);
  } catch (err) {
    console.error('❌ Publisher sync failed:', err instanceof Error ? err.message : String(err));
  }

  console.log('✅ Server ready!\n');
  
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
    console.log(`📁 VIDEOS_ROOT=${VIDEOS_ROOT}\n`);
  });
}

start().catch((err) => {
  console.error('❌ Fatal error starting server:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});


