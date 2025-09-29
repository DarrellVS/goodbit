import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', apiRouter);

// Serve uploaded content publicly with aggressive browser revalidation to avoid stale cached videos
app.use(express.static(UPLOAD_DIR, {
  etag: true,
  maxAge: 0,
  setHeaders: (res) => {
    // Ensure browsers revalidate or refetch; CDN is purged separately
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => {
  console.log(`Publisher listening on http://localhost:${PORT}`);
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
});


