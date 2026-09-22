import fs from 'node:fs';
import path from 'node:path';
import { posterPathFor, posterUrlFor } from '../utils/posterPath.js';
import { goodBitLabel, parseGoodBits, type PublishedGoodBit } from '../utils/goodBits.js';

/**
 * Tell a Discord channel when a clip goes up, and when one comes down.
 *
 * **Optional, and it can never fail a publish.** Every path in here swallows
 * its own errors and logs them without the URL: the clip is already on disk
 * and its link already works by the time anything here runs, and a
 * notification that did not arrive is a missing message, not a missing clip.
 *
 * **The webhook URL is a secret in the same class as `PUBLISH_TOKEN`.**
 * Anybody holding it can post into that channel as this app. It lives in the
 * environment and nowhere else: it is never logged, not even in part, and it
 * never appears in a response. The file that burned this repository's
 * Cloudflare token was `publisher/.env.development`, which is why `.gitignore`
 * now matches every `.env.*` shape.
 *
 * **It is fired when the poster lands, not when the clip does.** A clip is
 * published in one request and its poster arrives in a later one. An embed
 * built during the first would reference a poster URL that is still a 404, and
 * Discord fetches the image once, when it renders the embed, and keeps what it
 * got: the card would be pictureless for ever. So `StoreThumbnailAction` fires
 * it, the same way it fires the poster's pre-warm, and a clip whose poster never
 * arrives (a desktop too old to send one) is announced after a short grace
 * period without a picture rather than not at all.
 */

const WEBHOOK_URL = (process.env.DISCORD_WEBHOOK_URL || '').trim();

/**
 * How long a publish waits for its poster before being announced without one.
 *
 * The desktop sends the poster straight after the upload, so this is seconds
 * in practice; a minute is generous. Configurable so the bench does not have
 * to wait a minute to see the fallback.
 */
const POSTER_GRACE_MS = Math.max(0, Number(process.env.DISCORD_POSTER_GRACE_MS) || 60_000);

/** Discord's own brand-neutral accent would do; this is the app's. */
const EMBED_COLOUR = 0xc1633e;

export function discordEnabled(): boolean {
  return /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\//.test(
    WEBHOOK_URL,
  ) || process.env.DISCORD_WEBHOOK_ALLOW_ANY === '1';
}

/**
 * Clips published this run that have not been announced yet.
 *
 * A clip enters when `PublishClipAction` decides it is a first publish, and
 * leaves when it is announced: by its poster arriving, or by the grace timer.
 * Whichever comes first wins, so a clip is announced exactly once.
 */
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * How long a takedown waits before it is announced.
 *
 * **A trim of a published clip unpublishes it and then publishes it again**,
 * under the same filename, a few seconds later: `TrimAndSwapClipAction`
 * unpublishes first so the old bytes are purged. Announcing each half would
 * post "taken down" and then "published" to the channel on every trim. So a
 * takedown is held for this long, and a publish of the same filename inside
 * the window cancels it and is itself treated as a re-publish.
 */
const TAKEDOWN_GRACE_MS = Math.max(0, Number(process.env.DISCORD_TAKEDOWN_GRACE_MS) || 5 * 60_000);

/** Takedowns waiting out their grace period, with the name to announce. */
const takedowns = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * A clip has just been written. Decide whether that is news.
 *
 * **First publish only.** A re-publish under the same filename happens on
 * every "shrink the published copy", and on every trim (see above). A channel
 * told three times that one clip went up has learned to mute the bot.
 *
 * @param hadSidecar whether a sidecar existed before this publish wrote one,
 *   which `PublishClipAction` reads before it writes.
 */
export function notePublished(filename: string, hadSidecar: boolean): void {
  if (!discordEnabled()) return;

  const takedown = takedowns.get(filename);
  if (takedown) {
    // Taken down and put back inside the window: a trim, not two events.
    clearTimeout(takedown);
    takedowns.delete(filename);
    return;
  }

  if (hadSidecar) return;

  const existing = pending.get(filename);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pending.delete(filename);
    void announcePublished(filename);
  }, POSTER_GRACE_MS);
  // Never a reason to keep the process alive.
  timer.unref?.();
  pending.set(filename, timer);
}

/**
 * The poster is on disk. If this clip was waiting to be announced, now is the
 * moment: the picture Discord is about to fetch exists.
 */
export function posterArrived(filename: string): void {
  const timer = pending.get(filename);
  if (!timer) return;
  clearTimeout(timer);
  pending.delete(filename);
  void announcePublished(filename);
}

/**
 * A clip has been taken down. Say so, once the grace period says it meant it.
 *
 * A clip unpublished before it was ever announced produces nothing at all: the
 * channel was never given that link.
 */
export function noteUnpublished(filename: string, displayName: string | null): void {
  if (!discordEnabled()) return;

  const waiting = pending.get(filename);
  if (waiting) {
    clearTimeout(waiting);
    pending.delete(filename);
    return;
  }

  const existing = takedowns.get(filename);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    takedowns.delete(filename);
    void post({
      embeds: [
        {
          title: displayName || filename,
          description: 'Taken down. The link no longer works.',
          color: 0x6b6f76,
        },
      ],
    });
  }, TAKEDOWN_GRACE_MS);
  timer.unref?.();
  takedowns.set(filename, timer);
}

interface Sidecar {
  displayName: string;
  game: string;
  goodBits: PublishedGoodBit[];
}

/** The sidecar, as the embed page reads it, so the two cannot disagree. */
function readSidecar(uploadDir: string, filename: string): Sidecar {
  const fallback: Sidecar = { displayName: filename, game: '', goodBits: [] };
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(uploadDir, `${filename}.meta.json`), 'utf-8'));
    return {
      displayName: typeof meta.displayName === 'string' && meta.displayName ? meta.displayName : filename,
      game: typeof meta.game === 'string' ? meta.game : '',
      goodBits: parseGoodBits(meta.goodBits) ?? [],
    };
  } catch {
    return fallback;
  }
}

/**
 * One line about the marks, which are the most interesting thing in the embed.
 *
 * "3 marked moments" and the name of the first beats the filename, which is a
 * timestamp. Named with the same function the embed page's chips use.
 */
export function describeMarks(goodBits: PublishedGoodBit[]): string | null {
  if (!goodBits.length) return null;
  const first = goodBitLabel(goodBits[0], 0);
  if (goodBits.length === 1) return `One marked moment: ${first}`;
  return `${goodBits.length} marked moments, starting with ${first}`;
}

/**
 * Build the embed and send it.
 *
 * Links to the **embed page**, not to `/media`. The page is what carries the OG
 * tags, the poster, the chapter rail and the download button; a raw media URL
 * in Discord is an inline player and nothing else.
 */
async function announcePublished(filename: string): Promise<void> {
  if (!discordEnabled()) return;

  const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  // Without a public address there is no link to give anybody.
  if (!base) {
    console.warn('[discord] PUBLIC_BASE_URL is empty, so there is no link to announce');
    return;
  }

  const meta = readSidecar(uploadDir, filename);
  const hasPoster = fs.existsSync(posterPathFor(uploadDir, filename));
  const marks = describeMarks(meta.goodBits);

  const embed: Record<string, unknown> = {
    title: meta.displayName,
    url: `${base}/${encodeURIComponent(filename)}`,
    color: EMBED_COLOUR,
  };
  if (meta.game) embed.author = { name: meta.game };
  if (marks) embed.description = marks;
  if (hasPoster) embed.image = { url: posterUrlFor(base, filename) };

  await post({ embeds: [embed] });
}

/**
 * Send, and never throw.
 *
 * **A 429 is logged and dropped, not retried.** A notification arriving late
 * is fine; a retry loop against a rate limit is how a bot gets its webhook
 * revoked. Any other failure is logged with the status and never the URL.
 */
async function post(body: unknown): Promise<void> {
  try {
    const response = await fetch(`${WEBHOOK_URL}?wait=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 429) {
      console.warn('[discord] rate limited, message dropped');
      return;
    }
    if (!response.ok) {
      console.warn(`[discord] webhook answered ${response.status}, message dropped`);
    }
  } catch (error) {
    console.warn('[discord] could not reach the webhook:', (error as Error).name);
  }
}
