import fs from 'fs';
import path from 'path';

/**
 * How many times each clip's page has been opened.
 *
 * **The publisher recorded nothing about requests before this.** No counter,
 * no access log, no morgan, no analytics, no database: its dependencies are
 * exactly `cors`, `dotenv`, `express` and `multer`, and the embed handler does
 * one `existsSync`, one `readFileSync` and returns HTML. The number the
 * insights dashboard wants did not exist anywhere, so this creates it.
 *
 * **One file, not a sidecar per clip, and not SQLite.** The sidecar shape is
 * right for metadata and wrong for this, for three reasons that are all about
 * a counter rather than about files in general:
 *
 * - A counter is written on a **read**, at a rate set by strangers. A sidecar
 *   is written on a publish, by one desktop, and `UpdateMetadataAction`
 *   rewrites it wholesale. Putting a hot counter in there means a metadata
 *   sync silently resets everybody's view counts.
 * - The questions are **aggregates**: total views, and everything not viewed
 *   since a date. Per-clip files make that an O(n) read sweep per dashboard
 *   open; one file makes it one read.
 * - `/media` is `express.static(UPLOAD_DIR)`, so anything in there is served.
 *   A `<clip>.views.json` would be public at
 *   `/media/<clip>.mp4.views.json` and listed by `GET /api/publish/`.
 *
 * So: one file, outside `UPLOAD_DIR`, held in memory and flushed when dirty.
 * Express here is one process, so the map needs no locking, and **a
 * synchronous write per page view is not acceptable on the hot path**.
 */

export interface ViewRecord {
  views: number;
  /** ISO, of the most recent open. */
  lastViewedAt: string;
}

/**
 * Where the counts live.
 *
 * Deliberately **not** inside `UPLOAD_DIR`. In the image `UPLOAD_DIR` is
 * `/data/public`, so the default is `/data/views.json`: the same declared
 * volume, outside the served directory. Somebody who bind-mounts only
 * `/data/public` loses their counts on every container restart, which is why
 * `.env.example` and the setup guide both say so.
 */
const VIEWS_FILE =
  process.env.VIEWS_FILE ||
  path.join(path.dirname(path.resolve(process.env.UPLOAD_DIR || './public')), 'views.json');

/**
 * How often the counts are written out.
 *
 * Long enough that a busy minute is one write, short enough that a container
 * killed rather than stopped loses very little. Configurable because the
 * shutdown flush cannot be relied on everywhere: `SIGTERM` runs handlers on
 * Linux, which is where this runs in production, and on Windows Node kills a
 * spawned process outright, so `scripts/publisher-views-check.mjs` turns this
 * down and tests the timer instead of a signal.
 */
const FLUSH_MS = Math.max(200, Number(process.env.VIEWS_FLUSH_MS) || 30_000);

const counts = new Map<string, ViewRecord>();
let dirty = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * When this publisher first started counting, ever.
 *
 * Written into the counters file on the first run and never changed. It is the
 * one thing that makes "0 views" readable: a clip published two years ago and
 * one published this morning both read zero on the day this ships, and without
 * a start date anything that suggests a cleanup would confidently offer up the
 * entire library.
 *
 * Deliberately not derived from the oldest count. A publisher that has been
 * running for a year and has never had a viewer has been counting for a year,
 * and deriving it would say it had never started.
 */
let startedAt: string | null = null;

/**
 * What is not a viewer.
 *
 * The pre-warm asks for the page on purpose, as a reachability check, so
 * without this every clip would start life with exactly one view. A `HEAD` is
 * not a view either: it is something checking the page exists.
 */
const NOT_A_VIEWER = /GoodBit-Publisher\/cache-prewarm/i;

export function loadViewCounts(): void {
  try {
    const raw = fs.readFileSync(VIEWS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as {
      startedAt?: string;
      clips?: Record<string, ViewRecord>;
    };

    startedAt = typeof parsed?.startedAt === 'string' ? parsed.startedAt : null;

    for (const [filename, record] of Object.entries(parsed?.clips ?? {})) {
      if (!filename || typeof record?.views !== 'number') continue;
      counts.set(filename, {
        views: Math.max(0, Math.floor(record.views)),
        lastViewedAt: typeof record.lastViewedAt === 'string' ? record.lastViewedAt : '',
      });
    }
    console.log(`[views] ${counts.size} clips, from ${VIEWS_FILE}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    // A first run has no file, which is not a problem worth a line of noise.
    if (code !== 'ENOENT') {
      console.warn(`[views] could not read ${VIEWS_FILE}:`, (error as Error).message);
    }
  }

  if (!startedAt) {
    // First run. Recorded now and written out immediately, so a publisher that
    // is restarted before anybody visits still knows when it began.
    startedAt = new Date().toISOString();
    dirty = true;
    flushViewCounts();
    console.log(`[views] counting from ${startedAt}`);
  }

  if (!timer) {
    timer = setInterval(() => flushViewCounts(), FLUSH_MS);
    // Never a reason to hold the process open.
    timer.unref?.();
  }
}

/**
 * Count one open of a clip's page.
 *
 * **The embed page only.** `/media` answers `s-maxage=31536000` since 3.4.3,
 * so the CDN absorbs nearly all of those and a counter there would measure
 * cache misses rather than viewers: a number that falls as the caching works
 * better, which is worse than no number. The page is `no-store`, so every open
 * reaches the origin and this is honest.
 */
export function recordView(filename: string, method: string, userAgent: string | undefined): void {
  if (method !== 'GET') return;
  if (userAgent && NOT_A_VIEWER.test(userAgent)) return;

  const now = new Date().toISOString();
  const current = counts.get(filename);

  counts.set(filename, {
    views: (current?.views ?? 0) + 1,
    lastViewedAt: now,
  });
  dirty = true;
}

export function viewsFor(filename: string): ViewRecord {
  return counts.get(filename) ?? { views: 0, lastViewedAt: '' };
}

/** Drop a clip's counts. Called when it is unpublished; the clip is gone. */
export function forgetViews(filename: string): void {
  if (counts.delete(filename)) dirty = true;
}

/**
 * Write the counts out, if anything changed.
 *
 * Through a temporary file and a rename, so a crash mid-write cannot leave
 * truncated JSON where the counts were. `StoreThumbnailAction` already does
 * this for the poster; the metadata sidecar does not, which is a separate
 * three-line fix in this same change.
 */
export function flushViewCounts(): void {
  if (!dirty) return;

  const clips: Record<string, ViewRecord> = {};
  for (const [filename, record] of counts) clips[filename] = record;
  const payload = { startedAt, clips };

  const temporary = `${VIEWS_FILE}.tmp`;
  try {
    fs.mkdirSync(path.dirname(VIEWS_FILE), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(payload), 'utf-8');
    fs.renameSync(temporary, VIEWS_FILE);
    dirty = false;
  } catch (error) {
    // Never throws to a caller. A lost count is a number; a request that
    // failed because a counter could not be saved is a broken page.
    console.warn('[views] could not save:', (error as Error).message);
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* nothing to clean up */
    }
  }
}

/**
 * When counting began, or null on a publisher that has somehow never started.
 *
 * The honest answer to "0 views" on an old clip, and the thing anything
 * suggesting a cleanup has to wait for.
 */
export function countingSince(): string | null {
  return startedAt;
}
