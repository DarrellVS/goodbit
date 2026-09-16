/**
 * What happens to a clip's GoodBits when the recording under them is cut.
 *
 * A trim replaces the file with a range of itself, so every timestamp on that
 * clip moves. A GoodBit at 20 to 25 on a recording cut to 0 to 10 is not
 * approximately wrong, it points at footage that is no longer in the file, and
 * one at 8 to 14 is half in and half out. Neither reads as broken: the band
 * still draws, at a place where nothing happens.
 *
 * `TrimAndSwapClipAction` did not know the table existed, so this is the rule
 * it was missing. The choice is between dropping every mark on a trimmed clip
 * and moving the ones that survive, and moving them is clearly right: somebody
 * who marked three moments and then cut the clip down to one of them should
 * keep the mark on the part they kept.
 *
 * Pure, so the arithmetic is testable without a database. The action applies
 * what this returns.
 */

export interface TrimmableGoodBit {
  id: number;
  startSec: number;
  endSec: number;
}

export interface GoodBitAfterTrim {
  id: number;
  startSec: number;
  endSec: number;
  /** True when an edge was pulled in to the new boundary. */
  clamped: boolean;
}

export interface GoodBitsAfterTrimPlan {
  /** Marks that survive, with their new positions, in clip order. */
  moved: GoodBitAfterTrim[];
  /** Ids of marks the cut removed entirely. */
  dropped: number[];
}

/**
 * How much of a mark has to survive the cut for it to be worth keeping.
 *
 * A mark clipped to a tenth of a second is not the moment somebody marked, it
 * is the edge of it, and keeping it means a band nobody can press sitting at
 * the very start or end of the new file. The server already refuses to create
 * anything shorter than this, so keeping one would also be a row it would not
 * accept.
 */
const MIN_SURVIVING_SEC = 0.1;

/**
 * Move the marks that survive a cut to `[startSec, endSec]`, drop the rest.
 *
 * Everything shifts by `-startSec`, because the new file begins where the cut
 * did. A mark entirely outside the kept range is dropped. A mark that straddles
 * a boundary is kept and clamped to it, because the part inside is still the
 * moment: cutting the first two seconds off a five second mark leaves three
 * seconds of the thing that was marked, and dropping it would throw away a
 * decision over an edge the person moving the handles could see.
 */
export function planGoodBitsAfterTrim(
  goodBits: TrimmableGoodBit[],
  startSec: number,
  endSec: number,
): GoodBitsAfterTrimPlan {
  const moved: GoodBitAfterTrim[] = [];
  const dropped: number[] = [];

  for (const goodBit of goodBits) {
    // Entirely before or entirely after what was kept. `<=` and `>=` on
    // purpose: a mark that only touches the boundary shares no footage with
    // the new file.
    if (goodBit.endSec <= startSec || goodBit.startSec >= endSec) {
      dropped.push(goodBit.id);
      continue;
    }

    const keptStart = Math.max(goodBit.startSec, startSec);
    const keptEnd = Math.min(goodBit.endSec, endSec);

    if (keptEnd - keptStart < MIN_SURVIVING_SEC) {
      dropped.push(goodBit.id);
      continue;
    }

    moved.push({
      id: goodBit.id,
      startSec: round(keptStart - startSec),
      endSec: round(keptEnd - startSec),
      clamped: keptStart !== goodBit.startSec || keptEnd !== goodBit.endSec,
    });
  }

  moved.sort((a, b) => a.startSec - b.startSec);
  return { moved, dropped };
}

/**
 * Three decimals, which is the resolution the column and the UI both use.
 *
 * Subtracting one float from another produces things like `4.300000000000001`,
 * and a range that reads `0:04 – 0:06` in the app should not carry fifteen
 * digits in the database.
 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
