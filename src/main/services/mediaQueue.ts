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
 * What each job is reading, so somebody can wait for a file to be free.
 *
 * ffmpeg holds a read handle for as long as it runs, and on Windows a file
 * with an open handle cannot be renamed: the attempt fails with `EBUSY`. That
 * is fine while the only thing that touches a clip is the cache, and not fine
 * the moment a trim tries to swap the file underneath it. Queuing made it more
 * likely rather than less, because a job that used to start immediately can
 * now still be waiting when the cut finishes.
 */
const bySource = new Map<string, Set<AbortController>>();

function track(source: string, controller: AbortController, work: Promise<unknown>): void {
  const key = source.toLowerCase();
  const running = bySource.get(key) ?? new Set();
  running.add(controller);
  bySource.set(key, running);

  void work.catch(() => {}).finally(() => {
    running.delete(controller);
    if (running.size === 0) bySource.delete(key);
  });
}

/**
 * Stop whatever this queue is doing with that file, and wait for it to let go.
 *
 * Called before a clip is rewritten. Cancelling rather than waiting, because
 * every job here is building a cache *of the file that is about to change*: a
 * frame strip finished a moment before a trim is a frame strip of a clip that
 * no longer exists, so waiting for it costs seconds and produces something
 * that has to be thrown away regardless.
 *
 * The wait afterwards is short but not optional. `kill` asks the process to
 * end and Windows releases the file handle when it actually does, which is not
 * the same instant.
 */
export async function cancelSource(source: string): Promise<void> {
  const key = source.toLowerCase();

  for (const controller of bySource.get(key) ?? []) controller.abort();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const running = bySource.get(key);
    if (!running || running.size === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

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

/**
 * Both, which is what every cache builder wants.
 *
 * `source` is the file the work reads. Pass it, or a trim can rename that file
 * out from under a running ffmpeg.
 */
export function onceLimited<T>(
  key: string,
  work: (signal: AbortSignal) => Promise<T>,
  source?: string,
): Promise<T> {
  const controller = new AbortController();
  const started = once(key, () => runLimited(() => work(controller.signal)));
  if (source) track(source, controller, started);
  return started;
}

/** Thrown when a cache job was cancelled because its source is being replaced. */
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

/** For a diagnostic, and for a test that wants to prove the ceiling holds. */
export function queueState(): { limit: number; running: number; waiting: number } {
  return { limit: LIMIT, running, waiting: waiting.length };
}
