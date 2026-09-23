import { describe, expect, it } from 'vitest';
import { statsAreStale } from '../../../src/main/services/publisherStatsFreshness';

/**
 * When the library asks the publisher for new view counts.
 *
 * It asks on every open and every focus, so this is what keeps that from
 * being a request over somebody's home uplink on every alt-tab.
 */
describe('statsAreStale', () => {
  const minute = 60_000;

  it('asks when nobody has asked yet', () => {
    expect(statsAreStale(null, 1_000, 10 * minute)).toBe(true);
  });

  it('does not ask again inside the window', () => {
    expect(statsAreStale(0, 10 * minute - 1, 10 * minute)).toBe(false);
  });

  it('asks again once the window has passed', () => {
    expect(statsAreStale(0, 10 * minute, 10 * minute)).toBe(true);
  });

  it('asks when the clock went backwards rather than trusting it for ever', () => {
    expect(statsAreStale(10 * minute, 0, 10 * minute)).toBe(true);
  });
});
