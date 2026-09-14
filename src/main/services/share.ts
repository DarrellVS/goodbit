/**
 * Handing a clip to your phone over the local network. No cable, no upload,
 * nothing leaving the house.
 *
 * Publishing is the other way to get a clip onto a phone, but it needs a server
 * somewhere and puts the file on the public internet. This serves exactly one
 * file, from this machine, behind a long random address, and stops on its own
 * after half an hour. Whoever is on the same network and has the address can
 * watch and save it while it runs; nobody else can.
 *
 * Deliberately separate from the app's own loopback server: that one answers
 * the whole API and is bound to 127.0.0.1 for a reason. This one binds to the
 * network and can only ever hand out the single file it was started with.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { basename, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

/** How long a share stays up before it closes itself. */
export const SHARE_MINUTES = 30;

export interface ShareState {
  url: string;
  clipId: number;
  name: string;
  /** Epoch milliseconds at which this share closes itself. */
  until: number;
}

/** The address of this computer on the local network, if it has one. */
export function localAddress(): string | null {
  const all = Object.values(networkInterfaces()).flatMap((list) => list ?? []);
  const usable = all.filter((n) => n.family === 'IPv4' && !n.internal && n.address);
  // A home network first (192.168.x, 10.x, 172.16–31.x), anything else after.
  const home = usable.find((n) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address));
  return (home ?? usable[0])?.address ?? null;
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
};

const escapeHtml = (s: string): string =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);

const page = (name: string, token: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(name)}</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; background:#0e0f11; color:#f2f3f5; font:15px/1.5 system-ui, sans-serif;
         display:flex; flex-direction:column; gap:14px; align-items:center; padding:18px }
  video { width:100%; max-width:680px; border-radius:12px; background:#000 }
  a { color:#fff; background:#f97316; padding:10px 18px; border-radius:10px;
      text-decoration:none; font-weight:600 }
  p { color:#a0a4ad; margin:0; text-align:center; max-width:420px; font-size:13px }
</style></head>
<body>
  <video src="/${token}/video" controls playsinline preload="metadata"></video>
  <a href="/${token}/video" download="${escapeHtml(name)}">Save to my phone</a>
  <p>Sent straight from the computer GoodBit is running on. This link stops working when you close
  it there, and in any case after ${SHARE_MINUTES} minutes.</p>
</body></html>`;

export class ShareService {
  private server: Server | null = null;
  private state: ShareState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private token = '';
  private file = '';

  /** Share one clip on the local network; any share already running is replaced. */
  async start(clipId: number, file: string): Promise<ShareState> {
    if (!existsSync(file)) throw new Error('That clip is not on this disk any more');

    const host = localAddress();
    if (!host) {
      throw new Error('This computer is not on a network right now, so there is nothing to share over');
    }

    this.stop();
    this.token = randomBytes(16).toString('hex');
    this.file = file;

    const token = this.token;
    const name = basename(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';

    const server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0];

      if (path === `/${token}` || path === `/${token}/`) {
        const body = page(name, token);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }

      if (path !== `/${token}/video`) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not here');
        return;
      }

      let size: number;
      try {
        size = statSync(this.file).size;
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('gone');
        return;
      }

      const head: Record<string, string> = {
        'content-type': type,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      };

      // Phones ask for pieces of the file while they play it.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;

        if (!(start <= end && end < size)) {
          res.writeHead(416, { 'content-range': `bytes */${size}` });
          res.end();
          return;
        }

        res.writeHead(206, {
          ...head,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': String(end - start + 1),
        });

        if (req.method === 'HEAD') res.end();
        else createReadStream(this.file, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, { ...head, 'content-length': String(size) });
      if (req.method === 'HEAD') res.end();
      else createReadStream(this.file).pipe(res);
    });

    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => {
        const address = server.address();
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('The share could not be started'));
      });
    });

    this.server = server;
    this.state = {
      url: `http://${host}:${port}/${token}`,
      clipId,
      name,
      until: Date.now() + SHARE_MINUTES * 60_000,
    };
    this.timer = setTimeout(() => this.stop(), SHARE_MINUTES * 60_000);

    console.log(`[share] serving ${name} on the local network until ${new Date(this.state.until).toISOString()}`);
    return this.state;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.server?.closeAllConnections?.();
    this.server?.close();
    this.server = null;
    this.state = null;
    this.token = '';
  }

  /** The running share, or null. Expired shares close themselves on the way past. */
  current(): ShareState | null {
    if (this.state && Date.now() > this.state.until) this.stop();
    return this.state;
  }
}

export const shareService = new ShareService();
