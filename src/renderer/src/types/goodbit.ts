// Re-exported as plain data, the way `./clip` does it: what arrives over the
// wire is the JSON of a DTO, with none of `BaseDTO`'s methods on it.
import type { GoodBitDTO, GoodBitSourceName } from '@shared/index';
import type { PlainData } from './plain';

export type GoodBit = PlainData<GoodBitDTO>;
export type GoodBitSource = GoodBitSourceName;

/**
 * What a new GoodBit is made of.
 *
 * `startSec` and `endSec` are the whole of it; everything else is optional and
 * the two detected kinds are the only callers that fill in `reason` and
 * `confidence`. Named as its own type because two things build one, somebody
 * dragging handles and a suggestion being kept, and they should be sending the
 * same shape.
 */
export interface NewGoodBit {
  startSec: number;
  endSec: number;
  name?: string | null;
  source?: GoodBitSource;
  reason?: string | null;
  confidence?: number | null;
}
