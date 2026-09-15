import os from 'node:os';

/**
 * How many ffmpegs may exist at once, and never two for the same thing.
 *
 * A thumbnail is one frame and costs almost nothing, so nothing ever limited
 * how many were made at a time. Then a library of a few hundred clips scrolled
 * past, every visible card asked for its own, and each request spawned an
 * `ffprobe` and an `ffmpeg` of its own. Several dozen decoders, each holding a
 * few hundred megabytes for a 3440x1440 AV1 source, is not a thumbnail cost,
 * it is the machine stopping.
 *
 * Two limits, and they fix different halves of that.
 *
 * **A ceiling on how many run.** The work is decode bound and the GPU is the
 * bottleneck, so more processes than a handful makes the whole set slower as
 * well as heavier.
 *
 * **One job per output.** The library asks for the same thumbnail from several
 * places at once, and the cards that scroll back into view ask again. Without
 * this, the same file is generated four times in parallel, into the same path,
 * which is both wasteful and a race over the file being written.
 */

/**
 * Four at a time on anything modern, two on a small machine.
 *
 * Deliberately not "one per core". These are ffmpeg processes with their own
 * threads, and the cost that hurt here was memory rather than CPU.
 */
const LIMIT = Math.max(2, Math.min(4, Math.floor(os.cpus().length / 4)));

let running = 0;
const waiting: Array<() => void> = [];

function take(): Promise<void> {
  if (running < LIMIT) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    next();
    return;
  }
  running -= 1;
}

/** Run when there is room. Everything that spawns ffmpeg for a cache goes through here. */
export async function runLimited<T>(work: () => Promise<T>): Promise<T> {
  await take();
  try {
    return await work();
  } finally {
    release();
  }
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * One job per key, however many callers ask for it.
 *
 * The result is shared, and the entry is dropped as soon as it settles, so a
 * later request regenerates rather than being handed a stale promise.
 */
export function once<T>(key: string, work: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const started = work().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** Both, which is what every cache builder wants. */
export function onceLimited<T>(key: string, work: () => Promise<T>): Promise<T> {
  return once(key, () => runLimited(work));
}

/** For a diagnostic, and for a test that wants to prove the ceiling holds. */
export function queueState(): { limit: number; running: number; waiting: number } {
  return { limit: LIMIT, running, waiting: waiting.length };
}
