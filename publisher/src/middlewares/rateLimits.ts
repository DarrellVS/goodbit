import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

/**
 * How often one visitor may ask this server to read its own disk.
 *
 * The embed page and the API both touch the filesystem on every request, the
 * page for a sidecar and the API for a directory listing or an upload, so
 * without a ceiling one script in a loop is enough to keep the disk busy for
 * everybody else. `/media` is deliberately not limited: a video that seeks is
 * a burst of Range requests, and the edge answers most of them anyway.
 *
 * **Who "one visitor" is has to be read from a header.** This runs behind a
 * reverse proxy, often behind Cloudflare as well, so `req.ip` is the proxy for
 * every request and a limit keyed on it would be one bucket for the whole
 * internet: the first busy evening would lock every viewer out at once.
 * `CF-Connecting-IP` is Cloudflare's own, then the first `X-Forwarded-For`
 * hop, then the socket.
 *
 * Both headers can be forged by anyone who can reach the origin directly, and
 * that is accepted: forging one buys a fresh bucket, which is the same as no
 * limit, which is where this started. It never lets anybody in; the token does
 * that.
 */
export function visitorKey(req: Pick<Request, 'header' | 'ip'>): string {
  const cloudflare = req.header('cf-connecting-ip')?.trim();
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = cloudflare || forwarded || req.ip || 'unknown';
  // Groups an IPv6 address by its /56, since one household holds a whole range.
  return ipKeyGenerator(ip);
}

const shared = {
  windowMs: 60_000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: visitorKey,
  // The key is read from the forwarding headers on purpose, above; the
  // library's own check assumes `trust proxy` and would warn on every request.
  validate: { xForwardedForHeader: false },
} as const;

/**
 * The public embed page. Five a second, sustained for a minute, is far past
 * anybody pressing reload, and a Discord unfurl is one request.
 */
export const pageLimit = rateLimit({
  ...shared,
  limit: 300,
  message: { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many requests, slow down.' },
});

/**
 * The API, which the desktop drives, and where only failures count.
 *
 * A batch publish of short clips over a LAN is an upload, a poster and a
 * metadata write per clip, several a second, so any ceiling on every request
 * would eventually refuse the owner. What needs bounding is somebody without
 * the token, and every one of their requests is a 401: sixty wrong answers a
 * minute is a long way past a mistyped token and a long way short of guessing.
 */
export const apiLimit = rateLimit({
  ...shared,
  limit: 60,
  skipSuccessfulRequests: true,
  message: { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many requests, slow down.' },
});
