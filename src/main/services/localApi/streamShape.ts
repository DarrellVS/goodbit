/**
 * The decisions the stream makes, as pure functions: no sockets, no timers, so
 * `tests/unit` owns them. `stream.ts` supplies the clock and the writes.
 */

/** Past this many unwritten bytes a subscriber is dropped, never buffered further. */
export function isBackedUp(unwrittenBytes: number, limitBytes: number): boolean {
  return unwrittenBytes > limitBytes;
}

/**
 * Milliseconds to wait before a throttled push may go: 0 when `minMs` has
 * passed since the last one (or there was none), else the remainder.
 */
export function throttleDelay(lastAt: number | null, now: number, minMs: number): number {
  if (lastAt === null) return 0;
  return Math.max(0, minMs - (now - lastAt));
}

/** A subscriber that has heard nothing for `pingMs` is owed a ping. */
export function needsPing(lastWriteAt: number, now: number, pingMs: number): boolean {
  return now - lastWriteAt >= pingMs;
}

/**
 * Publish progress fires per upload tick. A line goes out when the stage
 * changed, at either end of a stage, or when `minMs` has passed.
 */
export class ProgressThrottle {
  private readonly last = new Map<number, { at: number; stage: string }>();

  constructor(private readonly minMs: number) {}

  allow(clipId: number, stage: string, percent: number, now: number): boolean {
    const previous = this.last.get(clipId);
    const edge = percent <= 0 || percent >= 100 || stage === 'done' || stage === 'failed';
    if (previous && previous.stage === stage && !edge && now - previous.at < this.minMs) return false;
    if (stage === 'done' || stage === 'failed') this.last.delete(clipId);
    else this.last.set(clipId, { at: now, stage });
    return true;
  }
}
