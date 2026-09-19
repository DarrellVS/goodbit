import { describe, expect, it } from 'vitest';
import { toPublishedGoodBits, type GoodBitLike } from '@shared/index.js';

function mark(fields: Partial<GoodBitLike>): GoodBitLike {
  return {
    id: 1,
    clipId: 1,
    startSec: 0,
    endSec: 1,
    name: null,
    source: 'manual',
    reason: null,
    confidence: null,
    ...fields,
  };
}

/**
 * What crosses to the publisher when a clip is published.
 *
 * The sidecar beside a published clip is one HTTP request away from the video
 * itself, so this is a question about what leaves the machine as well as one
 * about what the embed page can draw.
 */
describe('the marks that go up with a clip', () => {
  it('sends where the moment is and what to call it, and nothing else', () => {
    const sent = toPublishedGoodBits([
      mark({ id: 7, clipId: 3, startSec: 4.2, endSec: 9.8, name: 'Ace', source: 'hud', confidence: 0.91 }),
    ]);

    // No id, no clip id, no source, no confidence. An id means nothing on a
    // host with no database, and a confidence is a number about how this app
    // arrived at a mark rather than anything a viewer can act on.
    expect(sent).toEqual([{ startSec: 4.2, endSec: 9.8, name: 'Ace', reason: null }]);
  });

  it('keeps a detector’s sentence, because the page shows it', () => {
    const sent = toPublishedGoodBits([
      mark({ startSec: 1, endSec: 2, source: 'hud', reason: 'two kills, 3 seconds apart' }),
    ]);
    expect(sent[0].reason).toBe('two kills, 3 seconds apart');
  });

  it('puts them in the order they happen', () => {
    // The page numbers its "Highlight 2" fallback off this order.
    const sent = toPublishedGoodBits([
      mark({ startSec: 30, endSec: 32 }),
      mark({ startSec: 2, endSec: 4 }),
    ]);
    expect(sent.map((bit) => bit.startSec)).toEqual([2, 30]);
  });

  it('rounds to the millisecond and drops a range that is not a number', () => {
    const sent = toPublishedGoodBits([
      mark({ startSec: 1.23456789, endSec: 2.5 }),
      mark({ startSec: Number.NaN, endSec: 4 }),
    ]);
    expect(sent).toEqual([{ startSec: 1.235, endSec: 2.5, name: null, reason: null }]);
  });
});
