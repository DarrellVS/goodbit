import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Nobody uploads here but you.
 *
 * The publisher serves media to the public on purpose, and that half stays
 * open: a link is no use if it needs a password. Writing is a different
 * matter. Without this, anything that could reach the address could push files
 * onto the disk and delete them again, under the owner's own domain, which is
 * an open file host with someone else's name on it.
 *
 * Fails closed. With no `PUBLISH_TOKEN` set, every write is refused rather
 * than waved through, because the version of this that "works until you
 * configure it" is the version that is still unprotected a year later.
 */

/** Hashed before comparing, so two tokens of different lengths still compare in constant time. */
function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function presented(header: string | undefined, fallback: string | undefined): string | null {
  if (header) {
    const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (bearer) return bearer[1].trim();
  }
  return fallback?.trim() || null;
}

export const requireToken: RequestHandler = (req, res, next) => {
  const expected = process.env.PUBLISH_TOKEN?.trim();

  if (!expected) {
    res.status(503).json({
      status: 503,
      code: 'NO_TOKEN_CONFIGURED',
      message:
        'This publisher has no PUBLISH_TOKEN set, so it refuses every upload. ' +
        'Set one and restart it; see https://darrellvs.github.io/goodbit/publisher.html',
    });
    return;
  }

  const given = presented(
    req.header('authorization') ?? undefined,
    req.header('x-publish-token') ?? undefined,
  );

  if (!given || !crypto.timingSafeEqual(digest(given), digest(expected))) {
    res.status(401).json({
      status: 401,
      code: 'BAD_TOKEN',
      message: 'Wrong or missing publish token.',
    });
    return;
  }

  next();
};

/** Said once at boot, because a publisher that refuses everything should say why. */
export function warnIfUnprotected(): void {
  if (!process.env.PUBLISH_TOKEN?.trim()) {
    console.warn(
      '[publisher] PUBLISH_TOKEN is not set. Uploads and deletions are refused until it is.',
    );
  }
}
