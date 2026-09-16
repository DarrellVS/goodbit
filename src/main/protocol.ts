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
        /*
         * `corsEnabled` is what lets script reach this scheme at all.
         *
         * The renderer is a `file://` page, so every `goodbit://` request it
         * makes is cross origin. Without this privilege Chromium refuses
         * `fetch` and `XMLHttpRequest` before the request is dispatched, while
         * `<img>` and `<video>` keep working, because element loads are not
         * subject to CORS. That asymmetry is why this hid for so long: every
         * player and thumbnail in the app was fine and only the one thing that
         * uses `fetch`, the editor's audio waveform, silently drew nothing.
         *
         * It pairs with the `Access-Control-Allow-Origin` header below. This
         * privilege makes Chromium *apply* CORS to the scheme, and the header
         * is what then passes the check; setting either alone still fails.
         */
        corsEnabled: true,
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

  /*
   * `goodbit://media/art/<game>/<kind>`, Steam's own cached artwork.
   *
   * Addressed by game rather than by appid so the renderer never has to know
   * one, and so an unmatched game is simply a 404 rather than a special case
   * every card has to handle. The appid comes from the database, which is the
   * only place it is allowed to come from: a caller cannot name a folder to
   * read from.
   */
  if (kind === 'art') {
    const [game, wanted = 'header'] = id.split('/').map((part) => decodeURIComponent(part));
    if (!game) return null;

    const { artworkFile } = await import('./services/steam/artwork.js');
    const { Game } = await import('./entity/Game.js');
    const row = await AppDataSource.getRepository(Game).findOneBy({ name: game });
    if (!row?.steamAppId) return null;

    const KINDS = ['header', 'hero', 'portrait', 'logo', 'icon'] as const;
    const chosen = (KINDS as readonly string[]).includes(wanted) ? wanted : 'header';
    return artworkFile(row.steamAppId, chosen as (typeof KINDS)[number]);
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
 * What a custom scheme needs before `fetch` will touch it.
 *
 * `<video src>` and `<img src>` are not subject to CORS, which is why every
 * player and thumbnail in the app worked without this and hid the problem.
 * `fetch` is subject to it, and the renderer fetches exactly one thing over
 * this scheme: the audio track `useAudioWaveform` decodes to draw a waveform
 * from. Without these headers the browser rejects it with a bare
 * `TypeError: Failed to fetch` *before the handler is ever called*, and
 * `computePeaks` catches and returns null, so the waveform silently draws
 * nothing and no error appears anywhere.
 *
 * `Content-Range` has to be named explicitly. A cross origin response only
 * exposes the safelisted headers, and that list is Cache-Control,
 * Content-Language, Content-Length, Content-Type, Expires, Last-Modified and
 * Pragma. Anything reading the range back gets null otherwise, which is a
 * seek that silently does not know where it landed.
 *
 * `*` is not a loosening. The scheme is this app's own, nothing outside the
 * app can address it, and it serves files that are already on this machine.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

/** A refusal the caller can actually read, rather than a network failure. */
function notFound(): Response {
  return new Response('Not found', { status: 404, headers: CORS_HEADERS });
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
        ...CORS_HEADERS,
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
      ...CORS_HEADERS,
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
      if (url.hostname !== 'media') return notFound();

      // The rest is kept whole rather than taken as one segment: artwork is
      // addressed as `art/<game>/<kind>`, and a clip is still `clip/<id>`.
      const [, kind, ...rest] = url.pathname.split('/');
      const id = rest.join('/');
      if (!kind || !id) return notFound();

      const filePath = await resolveMedia(kind, id);
      if (!filePath) return notFound();

      return serveFile(filePath, request.headers.get('range'));
    } catch (error) {
      console.error('[protocol] failed:', error);
      return new Response('Error', { status: 500, headers: CORS_HEADERS });
    }
  });
}
