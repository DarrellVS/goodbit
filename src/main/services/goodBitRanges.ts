import { AppDataSource } from '../data-source.js';
import type { ClipDTO } from '@shared/index.js';

/**
 * Put each clip's marked ranges on the DTOs a list is about to answer with.
 *
 * The library card draws a band per GoodBit over the bottom of its picture, so
 * a tile says "two moments in here" before anything is opened. It needs the
 * ranges and nothing else.
 *
 * **One query for the page, not a relation.** Adding `goodBits` to the list's
 * `relations` would make TypeORM hydrate a full entity per row, with its name,
 * source, confidence, reason and timestamps, to draw a rectangle. This asks for
 * three columns for the ids actually on screen.
 *
 * Absent rather than empty when there is nothing: a caller that did not ask for
 * ranges and a clip that has none are different answers, and `goodBits: []` on
 * every clip in a library that has never marked one is a lie the card would
 * have to re-check anyway.
 */

/**
 * SQLite takes a limited number of bound parameters in one statement, so a
 * caller with a very long list is chunked rather than left to fail at some
 * page size nobody tested. 500 is comfortably inside every version's limit.
 */
const CHUNK = 500;

interface Range {
  startSec: number;
  endSec: number;
}

export async function attachGoodBitRanges(clips: ClipDTO[]): Promise<void> {
  if (clips.length === 0) return;

  const ids = clips.map((clip) => clip.id);
  const byClip = new Map<number, Range[]>();

  for (let at = 0; at < ids.length; at += CHUNK) {
    const slice = ids.slice(at, at + CHUNK);
    const rows: Array<{ clipId: number; startSec: number; endSec: number }> =
      await AppDataSource.query(
        `SELECT clipId, startSec, endSec FROM good_bit
          WHERE clipId IN (${slice.map(() => '?').join(', ')})
          ORDER BY clipId, startSec`,
        slice,
      );

    for (const row of rows) {
      const existing = byClip.get(row.clipId);
      const range = { startSec: row.startSec, endSec: row.endSec };
      if (existing) existing.push(range);
      else byClip.set(row.clipId, [range]);
    }
  }

  if (byClip.size === 0) return;

  for (const clip of clips) {
    const ranges = byClip.get(clip.id);
    if (ranges) clip.goodBits = ranges;
  }
}
