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
    <meta property="og:site_name" content="GoodBit">
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
      * { 
        margin: 0; 
        padding: 0; 
        box-sizing: border-box; 
      }
      
      @keyframes float1 {
        0% { cx: 80%; cy: 20%; }
        25% { cx: 75%; cy: 35%; }
        50% { cx: 85%; cy: 60%; }
        75% { cx: 70%; cy: 45%; }
        100% { cx: 80%; cy: 20%; }
      }
      
      @keyframes float2 {
        0% { cx: 20%; cy: 70%; }
        25% { cx: 25%; cy: 50%; }
        50% { cx: 15%; cy: 30%; }
        75% { cx: 30%; cy: 60%; }
        100% { cx: 20%; cy: 70%; }
      }
      
      @keyframes float3 {
        0% { cx: 50%; cy: 15%; }
        33% { cx: 65%; cy: 70%; }
        66% { cx: 35%; cy: 75%; }
        100% { cx: 50%; cy: 15%; }
      }
      
      @keyframes glow {
        0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3), 0 0 60px rgba(139, 92, 246, 0.1); }
        50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.5), 0 0 80px rgba(139, 92, 246, 0.2); }
      }
      
      body {
        background: linear-gradient(135deg, #0f0f1e 0%, #1a0f2e 100%);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 20px;
        overflow: hidden;
        position: relative;
      }
      
      .background {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        z-index: 0;
      }
      
      .background svg {
        width: 100%;
        height: 100%;
        filter: blur(100px);
      }
      
      .blob1 {
        fill: #8b5cf6;
        animation: float1 20s ease-in-out infinite;
      }
      
      .blob2 {
        fill: #6366f1;
        animation: float2 18s ease-in-out infinite;
      }
      
      .blob3 {
        fill: #a78bfa;
        animation: float3 22s ease-in-out infinite;
      }
      
      .container {
        max-width: 1400px;
        width: 100%;
        position: relative;
        z-index: 1;
      }
      
      .header {
        text-align: center;
        margin-bottom: 2rem;
      }
      
      h1 {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        background: linear-gradient(135deg, #fff, #a78bfa, #8b5cf6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1.2;
      }
      
      .game-tag {
        display: inline-block;
        padding: 0.5rem 1rem;
        background: rgba(139, 92, 246, 0.15);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 20px;
        font-size: 0.9rem;
        color: #c4b5fd;
        font-weight: 500;
        backdrop-filter: blur(10px);
      }
      
      .video-wrapper {
        position: relative;
        border-radius: 16px;
        overflow: hidden;
        animation: glow 3s ease-in-out infinite;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(139, 92, 246, 0.2);
      }
      
      video {
        width: 100%;
        display: block;
        background: #000;
      }
      
      video::-webkit-media-controls-panel {
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
      }
      
      .controls-hint {
        margin-top: 1.5rem;
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 0.9rem;
      }
      
      .controls-hint kbd {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85rem;
        margin: 0 0.25rem;
      }
      
      @media (max-width: 768px) {
        h1 {
          font-size: 1.75rem;
        }
        
        .game-tag {
          font-size: 0.8rem;
          padding: 0.4rem 0.8rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="background">
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="25" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 35 -15
            " result="gooey" />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop"/>
          </filter>
        </defs>
        <g filter="url(#gooey)" opacity="0.6">
          <circle class="blob1" cx="80%" cy="20%" r="250" />
          <circle class="blob2" cx="20%" cy="70%" r="220" />
          <circle class="blob3" cx="50%" cy="30%" r="200" />
        </g>
      </svg>
    </div>
    
    <div class="container">
      <div class="header">
        <h1>${escapeHtml(displayName)}</h1>
        ${game ? `<div class="game-tag">${escapeHtml(game)}</div>` : ''}
      </div>
      
      <div class="video-wrapper">
        <video id="video" controls poster="${thumbnailUrl}">
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
      
      <div class="controls-hint">
        <kbd>Space</kbd> to play/pause • <kbd>F</kbd> for fullscreen
      </div>
    </div>
    
    <script>
      const video = document.getElementById('video');
      
      document.addEventListener('keydown', (e) => {
        // Space for play/pause
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
        }
        
        // F for fullscreen
        if (e.code === 'KeyF' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (!document.fullscreenElement) {
            video.requestFullscreen().catch(err => {
              console.log('Fullscreen error:', err);
            });
          } else {
            document.exitFullscreen();
          }
        }
      });
    </script>
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


