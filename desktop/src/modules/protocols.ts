import { protocol } from 'electron';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { AppDataSource, VIDEOS_ROOT } from '../datasource';
import { Clip } from '../../../server/src/entity/Clip.ts';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

function parseQuery(url: string): Record<string, string> {
  const u = new URL(url);
  const out: Record<string, string> = {};
  for (const [k, v] of u.searchParams.entries()) out[k] = v;
  return out;
}

export function registerCustomProtocols(): void {
  protocol.registerStreamProtocol('media', async (request, callback) => {
    try {
      const q = parseQuery(request.url);
      const id = Number(q.id);
      const repo = AppDataSource.getRepository(Clip);
      const clip = await repo.findOneByOrFail({ id });
      const stat = fs.statSync(clip.filePath);
      const fileSize = stat.size;
      // Some Electron builds provide 'Range' capitalized; normalize
      const headersAny = request.headers as any;
      const rangeHeader = (headersAny['range'] as string | undefined) ?? (headersAny['Range'] as string | undefined);
      const ext = (clip.extension || '').toLowerCase();
      const contentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1;
        if (start >= fileSize || start > end) {
          start = 0; end = fileSize - 1;
        }
        const chunkSize = end - start + 1;
        callback({
          statusCode: 206,
          data: fs.createReadStream(clip.filePath, { start, end }),
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      } else {
        const start = 0;
        const end = Math.min(fileSize - 1, 2 * 1024 * 1024 - 1); // first 2MB to help demuxer start
        const chunkSize = end - start + 1;
        callback({
          statusCode: 206,
          data: fs.createReadStream(clip.filePath, { start, end }),
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }
    } catch (e) {
      callback({
        statusCode: 404,
        data: Readable.from([]),
        headers: {
          'Content-Length': '0',
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-store',
        },
      });
    }
  });

  protocol.registerStreamProtocol('thumb', async (request, callback) => {
    try {
      const q = parseQuery(request.url);
      const id = Number(q.id);
      const kind = new URL(request.url).hostname; // clip or strip
      const repo = AppDataSource.getRepository(Clip);
      const clip = await repo.findOneByOrFail({ id });
      const cacheDir = path.join(VIDEOS_ROOT, '.filmpje-cache', kind === 'strip' ? 'frames' : 'thumbnails');
      await fsPromises.mkdir(cacheDir, { recursive: true });
      const key = Buffer.from((kind === 'strip' ? clip.filePath + ':strip' : clip.filePath)).toString('hex') + '.jpg';
      const outPath = path.join(cacheDir, key);

      async function generateIfNeeded() {
        try {
          const [tStat, vStat] = await Promise.all([
            fsPromises.stat(outPath),
            fsPromises.stat(clip.filePath),
          ]);
          if (tStat.mtimeMs >= vStat.mtimeMs && tStat.size > 0) return;
        } catch {}
        if (kind === 'strip') {
          await new Promise<void>((resolve, reject) => {
            ffmpeg(clip.filePath)
              .outputOptions([
                '-frames:v', '1',
                '-vf', 'fps=1,scale=320:-1,tile=10x1:padding=2:color=black',
              ])
              .output(outPath)
              .on('end', () => resolve())
              .on('error', (e) => reject(e))
              .run();
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            ffmpeg(clip.filePath)
              .frames(1)
              .seekInput(1)
              .outputOptions(['-q:v 4'])
              .output(outPath)
              .on('end', () => resolve())
              .on('error', (e) => reject(e))
              .run();
          });
        }
      }

      await generateIfNeeded();
      const stream = fs.createReadStream(outPath);
      callback({
        statusCode: 200,
        data: stream,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=604800',
        },
      });
    } catch (e) {
      callback({
        statusCode: 404,
        data: Readable.from([]),
        headers: {
          'Content-Length': '0',
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-store',
        },
      });
    }
  });
}


