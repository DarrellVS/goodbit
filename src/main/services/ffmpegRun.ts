import type { FfmpegCommand } from 'fluent-ffmpeg';

export interface RunOptions {
  /** Abort to kill the ffmpeg process. Without this a cancelled job keeps rendering. */
  signal?: AbortSignal;
  /** Fraction 0..1 of this command, from ffmpeg's own progress readout. */
  onProgress?: (fraction: number) => void;
  /** Seconds of output expected, used to turn ffmpeg's timemark into a fraction. */
  durationSec?: number;
  /** Hard ceiling so a wedged process cannot hang a job forever. */
  timeoutMs?: number;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** `HH:MM:SS.ms` as seconds. */
function parseTimemark(mark: string): number {
  const parts = mark.split(':');
  if (parts.length !== 3) return 0;
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
}

/**
 * Run one ffmpeg command as a promise that can actually be cancelled.
 *
 * fluent-ffmpeg's `end`/`error` events are the only completion signal, and a
 * killed process arrives as an error — so an abort is translated back into a
 * CancelledError rather than being reported as a failed render.
 */
export function runFfmpeg(command: FfmpegCommand, opts: RunOptions = {}): Promise<void> {
  const { signal, onProgress, durationSec, timeoutMs = 60 * 60_000 } = opts;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());

    let settled = false;
    let killed = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      killed = true;
      try {
        command.kill('SIGKILL');
      } catch {
        /* the process may already be gone */
      }
    };

    const timer = setTimeout(() => {
      killed = true;
      try {
        command.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });

    command
      .on('progress', (p: { percent?: number; timemark?: string }) => {
        if (!onProgress) return;
        // percent is only present when ffmpeg knows the input duration; the
        // timemark is always there, so it is the more reliable of the two.
        let fraction: number | null = null;
        if (durationSec && durationSec > 0 && p.timemark) {
          fraction = parseTimemark(p.timemark) / durationSec;
        } else if (typeof p.percent === 'number' && Number.isFinite(p.percent)) {
          fraction = p.percent / 100;
        }
        if (fraction !== null) onProgress(Math.max(0, Math.min(1, fraction)));
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      })
      .on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(killed || signal?.aborted ? new CancelledError() : err);
      })
      .run();
  });
}
