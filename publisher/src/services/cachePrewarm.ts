import { posterUrlFor } from '../utils/posterPath.js';

/**
 * Warming the edge for a clip that has just been published.
 *
 * The first person to open a share link pays for a cache miss: Cloudflare has
 * never seen the URL, so it goes to the origin for the page, the poster and
 * the start of the video before anything appears. That person is usually the
 * one who pressed Publish, sharing the link in Discord seconds later, so the
 * miss lands on the worst possible viewer. Asking for the URLs ourselves, from
 * here, moves the miss to a moment when nobody is watching.
 *
 * Four rules hold this together, and none of them is optional:
 *
 * - **It never fails and never delays a publish.** `prewarmClip` returns
 *   `void`, not a promise, and everything inside it is wrapped. A warm is an
 *   optimisation; an upload that succeeded must not be reported as failed
 *   because a CDN was slow.
 * - **It does nothing without `PUBLIC_BASE_URL`.** Without one there is no
 *   address from outside to warm, and the Host header this server happens to
 *   be reached on is the LAN name rather than the edge.
 * - **It carries no credential.** These are plain public GETs against the
 *   published URLs, the same ones any viewer sends, so nothing here can leak
 *   a token and nothing logged here can either. Only the path and the status
 *   are logged; the base URL is public by definition and the secrets are not
 *   in scope of this file at all.
 * - **It waits for the purge in front of it.** Both callers purge the URLs
 *   they just rewrote before warming them. A purge is not instantaneous
 *   across the edge, and a warm that overtakes it would put the old object
 *   back, which is worse than not warming at all. `PURGE_SETTLE_MS` is the
 *   gap, and it costs nothing because this is already off the request path.
 */

/** How long a single warm request is allowed to take before it is abandoned. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * The gap between the purge the caller just did and the first warm request.
 * Cloudflare's own documentation puts a purge at "typically under five
 * seconds" globally; this is not a guarantee and cannot be turned into one,
 * so the value is a reasonable wait rather than a proof.
 */
const PURGE_SETTLE_MS = 5_000;

/**
 * How much of the video to ask for.
 *
 * A full GET of a clip is a few hundred megabytes pulled through the edge on
 * every publish, for a link that may never be opened, and this server is
 * typically somebody's home connection: the upload has only just finished
 * going up and the warm would send it all straight back down. A range request
 * asks for the part that decides how long the player takes to show a first
 * frame, which is the head of the file: the `moov` atom (GoodBit's exports and
 * trims are written by ffmpeg with `+faststart`, so it is at the front) plus
 * the first seconds of video, which is exactly what a `<video>` element
 * fetches before it paints anything.
 *
 * What the edge does with the rest is Cloudflare's decision rather than ours,
 * and the two possible answers are both acceptable: it may store the whole
 * object behind the range, in which case the clip is fully warm; or it may
 * store only what was asked for, in which case time-to-first-frame is warm
 * and the tail streams as it always did. Neither outcome is worth a gigabyte
 * of egress per publish to improve on.
 */
const VIDEO_WARM_BYTES = 4 * 1024 * 1024;

export interface PrewarmTarget {
  url: string;
  /** Inclusive end of the byte range to ask for, or `undefined` for the lot. */
  rangeEnd?: number;
  /** What this is, for the one log line. */
  what: string;
}

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function enabled(): boolean {
  // Opt out, not opt in: the default is the behaviour worth having, and the
  // switch is for a metered or very slow uplink where sending the head of
  // every published clip back down is not free.
  const raw = (process.env.CACHE_PREWARM || '').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function warmOne(target: PrewarmTarget): Promise<void> {
  const headers: Record<string, string> = {
    // Named honestly. Anybody reading their own access log should be able to
    // tell this apart from a viewer, and from a bot.
    'User-Agent': 'GoodBit-Publisher/cache-prewarm',
    'Accept-Encoding': 'gzip',
  };
  if (target.rangeEnd !== undefined) headers['Range'] = `bytes=0-${target.rangeEnd}`;

  const res = await fetch(target.url, {
    method: 'GET',
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  /*
   * The body has to be drained, not just received.
   *
   * `fetch` resolves on the headers. Dropping the response there leaves the
   * connection with an unread body, and an edge that has not finished
   * receiving an object does not cache it, so the warm would quietly do
   * nothing. `arrayBuffer()` is bounded by the range above.
   */
  await res.arrayBuffer().catch(() => undefined);

  // `cf-cache-status` is the whole point of the exercise, so it is worth
  // saying out loud. It is absent when nothing is in front of this server.
  const status = res.headers.get('cf-cache-status');
  console.log(
    `Pre-warm ${target.what}: ${res.status}${status ? ` (cf-cache-status: ${status})` : ''}`,
  );
}

/**
 * Warm a list of URLs, in the background, after the purge in front of them has
 * had time to land. Never throws, never rejects, and is not awaited.
 */
export function prewarm(targets: PrewarmTarget[]): void {
  if (!enabled() || targets.length === 0) return;

  void (async () => {
    await sleep(PURGE_SETTLE_MS);
    for (const target of targets) {
      try {
        await warmOne(target);
      } catch (err) {
        // A warm that failed leaves everything exactly as it was before it
        // ran: the next viewer gets a MISS, which is the old behaviour. So
        // this is a note, not a warning, and never an error.
        console.log(
          `Pre-warm ${target.what} did not complete:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  })();
}

/**
 * The page and the video for a clip that has just been published.
 *
 * The poster is not in here: it arrives in a request of its own, after this
 * one, and warming an address before the file is written would cache a 404.
 * `prewarmPoster` is called from where the picture actually lands.
 */
export function prewarmClip(filename: string): void {
  const base = baseUrl();
  if (!base) return;
  const encoded = encodeURIComponent(filename);
  prewarm([
    /*
     * The page is asked for even though it answers `no-store` and so is not
     * cached at the edge. It is not wasted: it is the request that makes this
     * server read the sidecar and `stat` the clip, so the operating system's
     * own page cache holds both by the time a person arrives, and it is a
     * cheap end-to-end check that what was just published is reachable from
     * outside at the address the link was built from. See `index.ts` for why
     * that header stays where it is.
     */
    { url: `${base}/${encoded}`, what: `page ${filename}` },
    { url: `${base}/media/${encoded}`, rangeEnd: VIDEO_WARM_BYTES - 1, what: `video ${filename}` },
  ]);
}

/** The poster frame, once it is on disk. A small JPEG, so all of it. */
export function prewarmPoster(filename: string): void {
  const base = baseUrl();
  if (!base) return;
  prewarm([{ url: posterUrlFor(base, filename), what: `poster ${filename}` }]);
}
