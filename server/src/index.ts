import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { AppDataSource, VIDEOS_ROOT } from './data-source.js';
import { router } from './routes.js';
import { scanAndSyncClips } from './scan.js';
import { verifyFirebaseToken } from './auth.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Public health endpoint
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Protect the rest of the API
app.use('/api', verifyFirebaseToken, router);

const PORT = Number(process.env.PORT || 4000);

async function start() {
  await AppDataSource.initialize();
  // Initial scan at startup
  try {
    await scanAndSyncClips();
    console.log('Initial scan completed');
  } catch (err) {
    console.error('Initial scan failed:', err);
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


