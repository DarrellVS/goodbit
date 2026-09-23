import { describe, expect, it } from 'vitest';
import { viewCountLabel } from '../../../src/renderer/src/utils/viewCount';

/**
 * The view count on a library card.
 *
 * Null and zero are the two that matter: both say nothing on a card, because
 * a card cannot tell "never opened" from "nothing was counting yet".
 */
describe('viewCountLabel', () => {
  it('says nothing when nobody has counted', () => {
    expect(viewCountLabel(null)).toBe('');
    expect(viewCountLabel(undefined)).toBe('');
  });

  it('says nothing for zero, which a card cannot tell from "not counted then"', () => {
    expect(viewCountLabel(0)).toBe('');
  });

  it('says nothing for a number that is not one', () => {
    expect(viewCountLabel(Number.NaN)).toBe('');
    expect(viewCountLabel(-3)).toBe('');
  });

  it('is singular for one', () => {
    expect(viewCountLabel(1)).toBe('1 view');
  });

  it('is plural and grouped above that', () => {
    expect(viewCountLabel(37)).toBe('37 views');
    expect(viewCountLabel(1234)).toBe('1,234 views');
  });
});
