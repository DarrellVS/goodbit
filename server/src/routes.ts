import express from 'express';
import fs from 'node:fs';
import { AppDataSource, VIDEOS_ROOT } from './data-source.js';
import { Clip } from './entity/Clip.js';
import { scanAndSyncClips } from './scan.js';
import trash from 'trash';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import crypto from 'node:crypto';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath?.path) {
  ffmpeg.setFfprobePath(ffprobePath.path);
}

export const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.post('/scan', async (_req, res, next) => {
  try {
    const result = await scanAndSyncClips();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/games', async (_req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Clip);
    const rows = await repo
      .createQueryBuilder('clip')
      .select('clip.game', 'game')
      .addSelect('COUNT(*)', 'count')
      .groupBy('clip.game')
      .orderBy('clip.game', 'ASC')
      .getRawMany();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/clips', async (req, res, next) => {
  try {
    const { game, q, page = '1', pageSize = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
    const pageSz = Math.min(Math.max(parseInt(pageSize || '50', 10) || 50, 1), 200);

    const repo = AppDataSource.getRepository(Clip);
    let qb = repo.createQueryBuilder('clip').orderBy('clip.fileModifiedAt', 'DESC');
    if (game && game.length > 0) {
      qb = qb.andWhere('clip.game = :game', { game });
    }
    if (q && q.length > 0) {
      qb = qb.andWhere('(clip.filename LIKE :q OR clip.displayName LIKE :q)', { q: `%${q}%` });
    }
    const [items, total] = await qb
      .skip((pageNum - 1) * pageSz)
      .take(pageSz)
      .getManyAndCount();
    res.json({ items, total, page: pageNum, pageSize: pageSz });
  } catch (err) {
    next(err);
  }
});

router.get('/clips/:id/stream', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    const filePath = clip.filePath;

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': clip.extension.toLowerCase() === 'mov' ? 'video/quicktime' : 'video/mp4',
      } as const;
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': clip.extension.toLowerCase() === 'mov' ? 'video/quicktime' : 'video/mp4',
      } as const;
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
});

router.patch('/clips/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { displayName } = req.body as { displayName?: string | null };
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    clip.displayName = displayName === undefined ? clip.displayName : (displayName && displayName.trim().length > 0 ? displayName.trim() : null);
    await repo.save(clip);
    res.json(clip);
  } catch (err) {
    next(err);
  }
});

router.delete('/clips/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });

    // Move to recycle bin for safety
    await trash([clip.filePath]);
    await repo.remove(clip);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/clips/:id/thumbnail', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });

    const cacheDir = path.join(VIDEOS_ROOT, '.filmpje-cache', 'thumbnails');
    await fsPromises.mkdir(cacheDir, { recursive: true });
    const key = crypto.createHash('md5').update(clip.filePath).digest('hex') + '.jpg';
    const thumbPath = path.join(cacheDir, key);

    const maybeServe = async () => {
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(thumbPath);
    };

    let needGenerate = true;
    try {
      const [tStat, vStat] = await Promise.all([
        fsPromises.stat(thumbPath),
        fsPromises.stat(clip.filePath),
      ]);
      if (tStat.mtimeMs >= vStat.mtimeMs && tStat.size > 0) {
        needGenerate = false;
      }
    } catch {
      needGenerate = true;
    }

    if (!needGenerate) {
      return void maybeServe();
    }

    const cmd = ffmpeg(clip.filePath)
      .frames(1)
      .seekInput(1)
      .outputOptions(['-q:v 4'])
      .output(thumbPath)
      .on('end', () => maybeServe())
      .on('error', (err) => next(err));
    cmd.run();
  } catch (err) {
    next(err);
  }
});

router.get('/clips/:id/meta', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    ffmpeg.ffprobe(clip.filePath, (err, data) => {
      if (err) return next(err);
      const format = data.format || {} as any;
      const streams = data.streams || [];
      const v = streams.find(s => (s.codec_type === 'video')) as any;
      res.json({
        durationSec: Number(format.duration || 0),
        width: v?.width || null,
        height: v?.height || null,
        codec: v?.codec_name || null,
        fps: v?.avg_frame_rate || v?.r_frame_rate || null,
      });
    });
  } catch (err) {
    next(err);
  }
});

router.get('/clips/:id/frame-strip', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });

    const cacheDir = path.join(VIDEOS_ROOT, '.filmpje-cache', 'frames');
    await fsPromises.mkdir(cacheDir, { recursive: true });
    const key = crypto.createHash('md5').update(clip.filePath + ':strip').digest('hex') + '.jpg';
    const stripPath = path.join(cacheDir, key);

    const maybeSend = () => {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.sendFile(stripPath);
    };

    let need = true;
    try {
      const [s, v] = await Promise.all([fsPromises.stat(stripPath), fsPromises.stat(clip.filePath)]);
      if (s.mtimeMs >= v.mtimeMs && s.size > 0) need = false;
    } catch {}

    if (!need) return void maybeSend();

    // Single-pass contact sheet: sample 10 frames (1 fps as heuristic), scale, and tile horizontally
    ffmpeg(clip.filePath)
      .outputOptions([
        '-frames:v', '1',
        '-vf', 'fps=1,scale=320:-1,tile=10x1:padding=2:color=black'
      ])
      .output(stripPath)
      .on('end', () => maybeSend())
      .on('error', (e) => next(e))
      .run();

  } catch (err) {
    next(err);
  }
});

router.post('/clips/:id/trim', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { startSec, endSec } = req.body as { startSec: number; endSec: number };
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id });
    if (!(startSec >= 0) || !(endSec > startSec)) {
      return res.status(400).json({ error: 'Invalid range' });
    }

    const dir = path.dirname(clip.filePath);
    const ext = path.extname(clip.filePath) || '.mp4';
    const tmpPath = path.join(dir, `${path.basename(clip.filePath, ext)}.tmp-${Date.now()}${ext}`);
    const bakPath = `${clip.filePath}.bak`;

    ffmpeg(clip.filePath)
      .setStartTime(startSec)
      .setDuration(endSec - startSec)
      .outputOptions(['-c:v libx264', '-c:a aac', '-preset veryfast', '-y'])
      .save(tmpPath)
      .on('end', async () => {
        try {
          // Atomic-like swap via .bak
          try { await fsPromises.rm(bakPath, { force: true }); } catch {}
          await fsPromises.rename(clip.filePath, bakPath);
          await fsPromises.rename(tmpPath, clip.filePath);
          try { await fsPromises.rm(bakPath, { force: true }); } catch {}

          // Update DB metadata
          const st = await fsPromises.stat(clip.filePath);
          clip.sizeBytes = st.size;
          clip.fileModifiedAt = st.mtime;
          await repo.save(clip);

          res.json({ ok: true });
        } catch (e) {
          try { await fsPromises.rm(tmpPath, { force: true }); } catch {}
          next(e);
        }
      })
      .on('error', async (e) => {
        try { await fsPromises.rm(tmpPath, { force: true }); } catch {}
        next(e);
      });
  } catch (err) {
    next(err);
  }
});


