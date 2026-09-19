import { describe, expect, it } from 'vitest';
import { parseGoodBits, sameGoodBits } from '../../../publisher/src/utils/goodBits.js';

/**
 * What the publisher is willing to store as a mark.
 *
 * Everything here arrives over the network, from a request that has passed a
 * bearer token and nothing else, and what comes out is written into a file
 * that is read back and injected into a page. So the two sides of this are
 * both worth a test: that a mark which cannot be drawn is dropped rather than
 * carried, and that the difference between "I have nothing to say about marks"
 * and "there are no marks" survives the trip, because those two mean opposite
 * things to a clip that already has bands on its scrubber.
 */
describe('the marks a publisher accepts', () => {
  it('tells silence apart from an empty list', () => {
    // Undefined is a request that did not mention marks, which is what an app
    // older than the chaptered player sends on every rename. Keeping what is
    // in the sidecar is the only safe reading of it.
    expect(parseGoodBits(undefined)).toBeUndefined();
    expect(parseGoodBits(null)).toBeUndefined();

    // An empty array is a statement: every mark was removed.
    expect(parseGoodBits([])).toEqual([]);
  });

  it('takes the JSON string a multipart field carries', () => {
    // `POST /api/publish` is multipart, because it carries the video, so the
    // list arrives as a string there and as an array on the PATCH beside it.
    const parsed = parseGoodBits('[{"startSec":1,"endSec":2,"name":"Ace","reason":null}]');
    expect(parsed).toEqual([{ startSec: 1, endSec: 2, name: 'Ace', reason: null }]);
  });

  it('is not talked into anything by a broken string', () => {
    expect(parseGoodBits('not json')).toBeUndefined();
    expect(parseGoodBits('{"startSec":1}')).toBeUndefined();
  });

  it('drops a range that cannot be drawn', () => {
    // A zero-length band paints as a scratch on the rail, and one that ends
    // before it starts paints backwards. Neither is a moment anybody marked.
    const parsed = parseGoodBits([
      { startSec: 5, endSec: 5 },
      { startSec: 9, endSec: 4 },
      { startSec: -2, endSec: 3 },
      { startSec: 'x', endSec: 3 },
      { startSec: 1, endSec: 3 },
    ]);
    expect(parsed).toEqual([{ startSec: 1, endSec: 3, name: null, reason: null }]);
  });

  it('puts them in the order they happen', () => {
    // The page numbers its "GoodBit 2" fallback off this order, so a list
    // that disagrees with the bands above it reads as a bug in the player.
    const parsed = parseGoodBits([
      { startSec: 12, endSec: 14 },
      { startSec: 2, endSec: 4 },
    ]);
    expect(parsed?.map((bit) => bit.startSec)).toEqual([2, 12]);
  });

  it('bounds the text it will show', () => {
    const long = 'x'.repeat(500);
    const parsed = parseGoodBits([{ startSec: 1, endSec: 2, name: long, reason: '  ' }]);
    expect(parsed?.[0].name).toHaveLength(200);
    // Whitespace is not a name. Left in, the chip would be an empty button
    // rather than falling back to "GoodBit 1".
    expect(parsed?.[0].reason).toBeNull();
  });

  it('knows when two lists would draw the same thing', () => {
    const a = parseGoodBits([{ startSec: 1, endSec: 2, name: 'Ace' }]) ?? [];
    const b = parseGoodBits('[{"startSec":1,"endSec":2,"name":"Ace"}]') ?? [];
    // The PATCH purges a CDN when this says no, and that sweep runs over every
    // published clip at once.
    expect(sameGoodBits(a, b)).toBe(true);
    expect(sameGoodBits(a, [])).toBe(false);
  });
});
