import type { GoodBitLike } from './GoodBitDTO.js';

/**
 * A GoodBit as it crosses to the publisher, and no more than that.
 *
 * The embed page draws a band on the scrubber and a chip under the player, so
 * it needs where the moment is and what to call it. It does not need the row
 * id, the clip id, the source or the confidence: an id means nothing on a host
 * with no database, and a confidence is a number about how this app arrived at
 * a mark rather than anything a viewer of the clip can act on. The sidecar is
 * world readable, being one HTTP request away from the video itself, so what
 * is not sent cannot leak.
 *
 * `name` and `reason` are both nullable and both carried, because the page
 * falls back from one to the other to "Highlight N": a hand marked GoodBit is
 * the common case and usually has neither.
 */
export interface PublishedGoodBit {
  /** Seconds from the start of the recording, which is `video.currentTime`. */
  startSec: number;
  endSec: number;
  name: string | null;
  reason: string | null;
}

/**
 * The marks on a clip, in the order they happen, ready to be uploaded.
 *
 * Sorted here rather than trusted from the query, because this list is also
 * what numbers the "Highlight 2" fallback on the page, and a list that arrives
 * in a different order from the bands above it reads as a bug in the player.
 *
 * Rounded to milliseconds, which is finer than any scrubber can be clicked and
 * keeps the sidecar readable when somebody opens it to see what was sent.
 */
export function toPublishedGoodBits(goodBits: readonly GoodBitLike[]): PublishedGoodBit[] {
  return goodBits
    .filter((goodBit) => Number.isFinite(goodBit.startSec) && Number.isFinite(goodBit.endSec))
    .map((goodBit) => ({
      startSec: Math.round(goodBit.startSec * 1000) / 1000,
      endSec: Math.round(goodBit.endSec * 1000) / 1000,
      name: goodBit.name ?? null,
      reason: goodBit.reason ?? null,
    }))
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}
