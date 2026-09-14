import { protocol } from 'electron';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { AppDataSource } from './data-source.js';
import { Clip } from './entity/Clip.js';
import { videoService } from './services/videoService.js';
import { resolveAudioPath } from './services/audioLibrary.js';

/**
 * Media, served straight off disk.
 *
 * `goodbit://media/clip/12` and friends replace the HTTP endpoints that video
 * and images used to come from. That removes the last reason for the loopback
 * server to exist once the data routes are on IPC, and with it the `?token=`
 * the old `<video>` tags had to carry because an element cannot send a header.
 *
 * Range support is the part that matters: without it a `<video>` element cannot
 * seek, and a thirty second 4K clip has to download in full before it plays.
 */

const SCHEME = 'goodbit';

/** Registered before `app.whenReady`, or Chromium will not treat it as privileged. */
export function registerProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        // `stream: true` is what enables Range requests and therefore seeking.
        stream: true,
        supportFetchAPI: true,
        bypassCSP: true,
        standard: true,
        secure: true,
      },
    },
  ]);
}

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

/** Resolve a `goodbit://media/<kind>/<id>` URL to a file on disk. */
async function resolveMedia(kind: string, id: string): Promise<string | null> {
  if (kind === 'audio') {
    // The id is a filename; resolveAudioPath is what keeps it inside the
    // music folder rather than anywhere the caller asks for.
    return resolveAudioPath(decodeURIComponent(id));
  }

  const clipId = Number(id);
  if (!Number.isFinite(clipId)) return null;

  const clip = await AppDataSource.getRepository(Clip).findOneBy({ id: clipId });
  if (!clip) return null;

  switch (kind) {
    case 'clip':
      return clip.filePath;
    case 'thumb':
      return videoService.ensureThumbnail(clip);
    case 'strip':
      return videoService.ensureFrameStrip(clip);
    default:
      return null;
  }
}

/**
 * Serve a file, honouring a Range header.
 *
 * Electron's `net.fetch` can serve a file URL directly, but it does not do
 * partial content, so a ranged request is answered here by hand, which is what
 * lets the player seek.
 */
function serveFile(filePath: string, rangeHeader: string | null): Response {
  const size = statSync(filePath).size;
  const type = contentTypeFor(filePath);

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    let start = match?.[1] ? Number(match[1]) : 0;
    let end = match?.[2] ? Number(match[2]) : size - 1;

    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
    // An unsatisfiable range is answered with the whole file rather than a 416;
    // players recover from that, and it is what the HTTP version did.
    if (start >= size || start > end) {
      start = 0;
      end = size - 1;
    }

    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
    },
  });
}

/** Called after the app is ready and the database is open. */
export function registerProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      // goodbit://media/clip/12 → host "media", path "/clip/12"
      if (url.hostname !== 'media') return new Response('Not found', { status: 404 });

      const [, kind, id] = url.pathname.split('/');
      if (!kind || !id) return new Response('Not found', { status: 404 });

      const filePath = await resolveMedia(kind, id);
      if (!filePath) return new Response('Not found', { status: 404 });

      return serveFile(filePath, request.headers.get('range'));
    } catch (error) {
      console.error('[protocol] failed:', error);
      return new Response('Error', { status: 500 });
    }
  });
}
