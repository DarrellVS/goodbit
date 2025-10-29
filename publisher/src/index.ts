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

// Serve raw media files (videos and thumbnails)
app.use('/media', express.static(UPLOAD_DIR, {
  etag: true,
  maxAge: 0,
  setHeaders: (res) => {
    // Ensure browsers revalidate or refetch; CDN is purged separately
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

// Video embed page with Open Graph meta tags for Discord/social media
app.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOAD_DIR, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video not found');
  }

  // Check if it's a video file
  const isVideo = /\.(mp4|mov)$/i.test(filename);
  if (!isVideo) {
    // For non-video files, serve them directly
    return res.sendFile(filePath);
  }

  // Get metadata file if it exists
  const metaPath = path.join(UPLOAD_DIR, `${filename}.meta.json`);
  let displayName = filename;
  let game = '';
  
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      displayName = meta.displayName || filename;
      game = meta.game || '';
    } catch (e) {
      // Ignore parsing errors
    }
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || req.protocol + '://' + req.get('host');
  const videoUrl = `${baseUrl}/media/${encodeURIComponent(filename)}`;
  const pageUrl = `${baseUrl}/${encodeURIComponent(filename)}`;
  const thumbnailUrl = `${baseUrl}/media/${encodeURIComponent(filename)}.thumb.jpg`;
  
  // Title with game name if available
  const title = game ? `${displayName} | ${game}` : displayName;
  
  // Serve HTML with Open Graph meta tags for Discord embed
  res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Open Graph / Discord -->
    <meta property="og:type" content="video.other">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:site_name" content="Filmpje">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:video" content="${videoUrl}">
    <meta property="og:video:url" content="${videoUrl}">
    <meta property="og:video:secure_url" content="${videoUrl}">
    <meta property="og:video:type" content="video/mp4">
    <meta property="og:video:width" content="1280">
    <meta property="og:video:height" content="720">
    <meta property="og:image" content="${thumbnailUrl}">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="player">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:player" content="${videoUrl}">
    <meta name="twitter:player:width" content="1280">
    <meta name="twitter:player:height" content="720">
    <meta name="twitter:image" content="${thumbnailUrl}">
    
    <title>${escapeHtml(title)}</title>
    
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: #0a0a0a;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 20px;
      }
      .container {
        max-width: 1200px;
        width: 100%;
      }
      h1 {
        font-size: 1.5rem;
        margin-bottom: 1rem;
        text-align: center;
      }
      video {
        width: 100%;
        max-width: 100%;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      .info {
        margin-top: 1rem;
        text-align: center;
        color: #888;
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${escapeHtml(title)}</h1>
      <video controls autoplay muted poster="${thumbnailUrl}">
        <source src="${videoUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div class="info">
        Powered by Filmpje
      </div>
    </div>
  </body>
</html>`);
});

// Helper to escape HTML entities
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => {
  console.log(`Publisher listening on http://localhost:${PORT}`);
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`);
});


