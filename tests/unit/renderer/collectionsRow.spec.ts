import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS_ROW_VISIBLE,
  collectionsRowLayout,
} from '../../../src/renderer/src/utils/collectionsRow';

/**
 * The collections row above the clips, as values.
 *
 * What cannot be checked here is the only thing that matters visually: whether
 * four cards actually fit the width. That is `screens.spec.ts`'s, and a pair of
 * eyes'. What is checked is the rule, which is the part that decides whether a
 * library with thirty collections buries the clips.
 */
describe('how much of the collections row is drawn', () => {
  it('draws everything while there are four or fewer', () => {
    for (let total = 0; total <= COLLECTIONS_ROW_VISIBLE; total++) {
      const layout = collectionsRowLayout(total, false);
      expect(layout.visible).toBe(total);
      expect(layout.hidden).toBe(0);
      // Nothing to show, so nothing offers to.
      expect(layout.toggleLabel).toBeNull();
    }
  });

  it('stops at four and counts the rest', () => {
    const layout = collectionsRowLayout(30, false);

    expect(layout.visible).toBe(4);
    expect(layout.hidden).toBe(26);
    // The number is in the offer, because "Show all 30" and "Show all 5" are
    // different propositions.
    expect(layout.toggleLabel).toBe('Show all 30');
  });

  it('draws all of them once asked', () => {
    const layout = collectionsRowLayout(30, true);

    expect(layout.visible).toBe(30);
    expect(layout.hidden).toBe(0);
    expect(layout.toggleLabel).toBe('Show less');
  });

  it('ignores an expansion with nothing to expand', () => {
    /*
     * The control that would collapse the row is only drawn when something is
     * hidden, so a library that was expanded and then lost collections until
     * four were left would otherwise sit in a state with no way out of it.
     */
    const layout = collectionsRowLayout(3, true);

    expect(layout.visible).toBe(3);
    expect(layout.flow).toBe('strip');
    expect(layout.toggleLabel).toBeNull();
  });

  it('survives a count that should not happen', () => {
    expect(collectionsRowLayout(-1, false).visible).toBe(0);
    expect(collectionsRowLayout(-1, false).hidden).toBe(0);
    expect(collectionsRowLayout(4.6, false).visible).toBe(4);
  });
});

describe('which way the row overflows', () => {
  /*
   * Two behaviours on purpose. Collapsed, the row is a strip that cannot wrap:
   * a window too narrow for four cards scrolls sideways rather than reflowing
   * the page under it. Expanded, it wraps, because a strip you scroll for
   * thirty items is worse than a block you look through.
   */
  it('is a strip until it is expanded', () => {
    expect(collectionsRowLayout(0, false).flow).toBe('strip');
    expect(collectionsRowLayout(4, false).flow).toBe('strip');
    expect(collectionsRowLayout(30, false).flow).toBe('strip');
  });

  it('is a wrapping grid after that', () => {
    expect(collectionsRowLayout(5, true).flow).toBe('grid');
    expect(collectionsRowLayout(30, true).flow).toBe('grid');
  });
});
