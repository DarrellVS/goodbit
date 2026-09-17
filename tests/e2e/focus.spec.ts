import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The focus ring, and whether anything cuts it in half.
 *
 * `focus-ring` is two box-shadows reaching 4px past the control, so it lives
 * entirely outside the border box. That is invisible to every other gate here:
 * the colours are right, the contrast is right, the element is the right size,
 * and the ring is still sliced off by an ancestor that clips.
 *
 * Two things do the cutting, and both had to be measured rather than guessed:
 *
 *  - **A scroll container clips on both axes.** `overflow-y: auto` computes
 *    `overflow-x` from `visible` to `auto`, so a column that only ever scrolls
 *    up and down still cuts a ring off at the left and the right. The sidebar
 *    was one of these.
 *  - **Focusing scrolls, and lands flush.** `scroll-into-view` aligns the
 *    element's border box with the edge of the scrollport, which is the
 *    padding box, so padding alone only saves the rows at the very top and
 *    bottom of a list. `scroll-padding` is what saves the rest, and the two
 *    are needed together.
 *
 * So this focuses every focusable thing on every screen, the way a keyboard
 * walk would, and asserts the ring's box is inside every clipping ancestor.
 */

/** Matches the `focus-ring` utility in `styles.css`: `0 0 0 4px`. */
const RING_REACH = 4;

const ROUTES = [
  { hash: '#/', name: 'library' },
  { hash: '#/today', name: 'today' },
  { hash: '#/stats', name: 'stats' },
  { hash: '#/tag-patterns', name: 'tag-patterns' },
  { hash: '#/settings?section=recording', name: 'settings-recording' },
  { hash: '#/settings?section=watching', name: 'settings-watching' },
  { hash: '#/settings?section=editing', name: 'settings-editing' },
  { hash: '#/settings?section=data', name: 'settings-data' },
  { hash: '#/settings?section=connections', name: 'settings-connections' },
  { hash: '#/settings?section=advanced', name: 'settings-advanced' },
  { hash: '#/editor', name: 'editor' },
];

interface Clip {
  /** A short path to the control whose ring is cut. */
  control: string;
  /** A short path to the ancestor doing the cutting. */
  clipper: string;
  /** Which edges are lost, and by how much. */
  edges: string;
}

interface Walk {
  clipped: Clip[];
  focused: number;
}

/**
 * Focus everything, and watch what happens to the ring.
 *
 * Serialised into the page, so it may not close over anything.
 */
function walkFocusables(reach: number): Walk {
  const clipped: Clip[] = [];
  let focused = 0;

  const where = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let i = 0; node && i < 4; i++) {
      const cls = (node.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join('.');
      parts.unshift(node.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });

  for (const el of candidates) {
    // Focus rather than measure in place: the browser scrolls a focused
    // element to `nearest`, which is exactly the position a keyboard user
    // sees it in, and exactly the position the ring is cut in.
    el.focus();
    if (document.activeElement !== el) continue;
    focused++;

    const rect = el.getBoundingClientRect();
    const ring = {
      top: rect.top - reach,
      bottom: rect.bottom + reach,
      left: rect.left - reach,
      right: rect.right + reach,
    };

    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const cutsX = style.overflowX !== 'visible';
      const cutsY = style.overflowY !== 'visible';
      if (!cutsX && !cutsY) continue;

      // The scrollport is the padding box, so the border comes off.
      const box = parent.getBoundingClientRect();
      const port = {
        top: box.top + parseFloat(style.borderTopWidth),
        bottom: box.bottom - parseFloat(style.borderBottomWidth),
        left: box.left + parseFloat(style.borderLeftWidth),
        right: box.right - parseFloat(style.borderRightWidth),
      };

      const lost: string[] = [];
      // Each edge is only a finding if the control itself is inside it. A row
      // scrolled out of sight is not a ring being cut, it is a row that is not
      // on screen, and reporting those would bury the real ones.
      if (cutsY && rect.top >= port.top - 0.5 && ring.top < port.top - 0.5) {
        lost.push('top by ' + (port.top - ring.top).toFixed(1));
      }
      if (cutsY && rect.bottom <= port.bottom + 0.5 && ring.bottom > port.bottom + 0.5) {
        lost.push('bottom by ' + (ring.bottom - port.bottom).toFixed(1));
      }
      if (cutsX && rect.left >= port.left - 0.5 && ring.left < port.left - 0.5) {
        lost.push('left by ' + (port.left - ring.left).toFixed(1));
      }
      if (cutsX && rect.right <= port.right + 0.5 && ring.right > port.right + 0.5) {
        lost.push('right by ' + (ring.right - port.right).toFixed(1));
      }

      if (lost.length > 0) {
        clipped.push({ control: where(el), clipper: where(parent), edges: lost.join(', ') });
      }
    }
  }

  return { clipped, focused };
}

test.describe('the focus ring survives its surroundings', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 3);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('nothing clips a focused control', async () => {
    const problems: string[] = [];
    let focused = 0;

    for (const route of ROUTES) {
      await ctx.page.evaluate((hash) => {
        window.location.hash = hash;
      }, route.hash);
      await ctx.page.waitForTimeout(700);

      const walk = await ctx.page.evaluate(walkFocusables, RING_REACH);
      focused += walk.focused;

      // One line per control, not per ancestor: a row inside three nested
      // scrollers reports three times and they are all the same fix.
      const seen = new Set<string>();
      for (const clip of walk.clipped) {
        const line = `${route.name}: ${clip.control}\n    cut ${clip.edges} by ${clip.clipper}`;
        if (seen.has(clip.control)) continue;
        seen.add(clip.control);
        problems.push(line);
      }
    }

    // A walk that focused almost nothing is a walk that went wrong, and it
    // reports an empty list either way. The contrast gate spent four days
    // saying exactly that.
    expect(focused, `only ${focused} controls were focused across every screen`).toBeGreaterThan(
      120,
    );
    console.log(`focused ${focused} controls`);

    expect(problems, `Focus rings cut off:\n${problems.join('\n')}`).toEqual([]);
  });
});
