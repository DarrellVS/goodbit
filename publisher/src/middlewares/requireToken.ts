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
    // Read by hand rather than with `/^Bearer\s+(.+)$/`, where `\s+` and `.+`
    // can both take the same spaces and a long run of them is quadratic. This
    // header is the one part of a request anybody on the internet can send.
    const value = header.trim();
    const scheme = value.slice(0, 6);
    if (scheme.toLowerCase() === 'bearer' && /\s/.test(value.charAt(6))) {
      const token = value.slice(7).trim();
      if (token) return token;
    }
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

/**
 * Said at boot, loudly, because the alternative is finding out mid upload.
 *
 * A publisher with no token starts, serves every clip it already has, and
 * refuses every write with a 503. All of that is deliberate. What was wrong is
 * where it was announced: one grey `console.warn` under a line reading
 * "Publisher listening", which is a log that looks like a successful start, so
 * the first real sign of trouble was a publish failing in GoodBit weeks later.
 * That reads as a broken app rather than as a variable nobody set.
 *
 * So: a block that cannot be skimmed past, naming the variable, what to set it
 * to and where the rest of the setup is written down. And a single line in the
 * healthy case, because "did my token reach the container" is the other
 * question this log gets asked, and quoting or a missed `env_file` is the usual
 * answer.
 *
 * Printed last, after the address, since the end of the log is where anybody
 * running `docker compose logs` starts reading.
 */
export function reportTokenState(): void {
  if (process.env.PUBLISH_TOKEN?.trim()) {
    console.log('[publisher] PUBLISH_TOKEN is set, so uploads are protected.');
    return;
  }

  const lines = [
    'PUBLISH_TOKEN is not set, so this publisher REFUSES EVERY UPLOAD.',
    '',
    'Reading still works: every clip already published is still being',
    'served. Nothing new can be added, and GoodBit will report a 503 the',
    'moment somebody presses Publish.',
    '',
    'Set PUBLISH_TOKEN to a long random string, give GoodBit the same',
    'string under Settings, App, and start this container again:',
    '',
    '    environment:',
    '      PUBLISH_TOKEN: "a long random string"',
    '',
    'One to paste, if you have no way of making one to hand:',
    '',
    '    openssl rand -base64 32',
    '',
    'The whole setup: https://darrellvs.github.io/goodbit/publisher.html',
  ];

  // Sized from the text, so the box closes whatever the text says.
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const rule = '#'.repeat(width);

  console.warn('');
  console.warn(rule);
  for (const line of lines) console.warn(`# ${line.padEnd(width - 4)} #`);
  console.warn(rule);
  console.warn('');
}
