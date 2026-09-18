import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Nothing scrolls sideways that was not built to.
 *
 * `screens.spec.ts` already asserts the *page* never scrolls, which catches the
 * worst case and misses every other one: a modal body, a settings column, a
 * panel inside a panel. Each of those is its own scrollport, and a stray 8px
 * inside one draws a scrollbar across the bottom of a screen that is otherwise
 * finished.
 *
 * The usual cause is a negative margin. `-m-1 p-1` is the trick for giving a
 * focus ring room inside a clipping box without moving what is in it, and in a
 * flex column it costs nothing, because stretch solves for the margin box.
 * Anywhere else it makes the element 8px wider than the box it sits in.
 *
 * A container is allowed to scroll sideways when it says so: `overflow-x-auto`
 * or `overflow-x-scroll` on the element itself is a declaration that the
 * content is wider than the frame, which is what a strip of chips or a timeline
 * is for. A carousel is the other legitimate case and it cannot be read off the
 * box model, because its viewport is `overflow: hidden` over a track that is
 * deliberately several screens wide, so it declares itself with
 * `data-overflow="intended"`. Everything else is a defect, and this reports the
 * widest child so there is something to go and look at.
 */

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

interface Offender {
  /** The scrollport that has grown a horizontal scrollbar. */
  container: string;
  /** How much wider its contents are. */
  overshoot: number;
  /** The child sticking out furthest, and by how much. */
  culprit: string;
}

/** A tolerance, because a sub-pixel layout rounds. */
const SLACK = 1.5;

function findSidewaysScroll(slack: number): Offender[] {
  const found: Offender[] = [];

  const where = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let i = 0; node && i < 3; i++) {
      const cls = (node.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join('.');
      parts.unshift(node.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const overshoot = el.scrollWidth - el.clientWidth;
    if (overshoot <= slack) continue;

    const style = getComputedStyle(el);
    // Declared sideways scrolling is a decision, not a defect.
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
    // And an element that does not clip has no scrollport to overflow.
    if (style.overflowX === 'visible') continue;
    // A carousel says so, because its box model cannot.
    if (el.closest('[data-overflow="intended"]')) continue;
    /*
     * Truncation is not overflow, it is the opposite.
     *
     * `truncate` is `overflow: hidden` plus `text-overflow: ellipsis` plus
     * `white-space: nowrap`, so a label that is successfully shortening itself
     * always reports content wider than its box. The ellipsis is the tell.
     */
    if (style.textOverflow === 'ellipsis') continue;
    /*
     * A one pixel box is a screen reader's, not a layout.
     *
     * `.sr-only` is `w-px h-px overflow-hidden`, so its content is always
     * wider than its box by the width of whatever it is announcing. Every
     * dropdown in the app has one, which made this gate report the same seven
     * labels on every screen.
     */
    if (el.clientWidth < 8) continue;

    // Which child actually sticks out, so there is something to look at.
    const box = el.getBoundingClientRect();
    const right = box.left + parseFloat(style.borderLeftWidth) + el.clientWidth;
    let worst: Element | null = null;
    let worstBy = 0;
    for (const child of Array.from(el.querySelectorAll('*'))) {
      const by = child.getBoundingClientRect().right - right;
      if (by > worstBy) {
        worstBy = by;
        worst = child;
      }
    }

    found.push({
      container: where(el),
      overshoot: Math.round(overshoot * 10) / 10,
      culprit: worst ? `${where(worst)} by ${worstBy.toFixed(1)}px` : 'nothing measurable',
    });
  }

  return found;
}

test.describe('nothing scrolls sideways that should not', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 3);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  /**
   * Two widths.
   *
   * A layout can be clean at 1280 and overflow at 1990, and this app is used
   * at the second: the recordings are 3440x1440 and the monitor matches. The
   * defect that prompted this gate was only visible in the wide one.
   */
  const WIDTHS = [1280, 1990];

  async function resize(width: number): Promise<void> {
    await ctx.app.evaluate(async ({ BrowserWindow }, w) => {
      const win = BrowserWindow.getAllWindows().find(
        (candidate) => !candidate.webContents.getURL().startsWith('data:'),
      );
      win?.setBounds({ x: 0, y: 0, width: w, height: 1100 });
    }, width);
    await ctx.page.waitForTimeout(500);
  }

  test('every screen, and the two modals', async () => {
    const problems: string[] = [];
    let checked = 0;

    const look = async (name: string): Promise<void> => {
      checked++;
      const found = await ctx.page.evaluate(findSidewaysScroll, SLACK);
      for (const offender of found) {
        problems.push(
          `${name}: ${offender.container} is ${offender.overshoot}px too wide\n` +
            `    widest child: ${offender.culprit}`,
        );
      }
    };

    const id = await ctx.page.evaluate(async () => {
      const answer = await window.goodbit!.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 1 },
      });
      return (answer.body as { items: Array<{ id: number }> }).items[0]?.id ?? null;
    });

    /*
     * Mark two, so the strip of chips is on screen.
     *
     * It is `v-if="goodBits.length > 0"` and a fresh fixture has none, so the
     * element this gate was written for was the one element it never painted.
     */
    if (id !== null) {
      await ctx.page.evaluate(async (clipId) => {
        for (const range of [
          { startSec: 0.2, endSec: 0.8, name: null },
          { startSec: 1, endSec: 1.4, name: 'A named one, to widen the strip' },
        ]) {
          await window.goodbit!.apiRequest({
            method: 'POST',
            path: `/clips/${clipId}/goodbits`,
            body: { ...range, source: 'manual' },
          });
        }
      }, id);
    }

    for (const width of WIDTHS) {
      await resize(width);

      for (const route of ROUTES) {
        await ctx.page.evaluate((hash) => {
          window.location.hash = hash;
        }, route.hash);
        await ctx.page.waitForTimeout(700);
        await look(`${width}px ${route.name}`);
      }

      /*
       * The clip panel and the trimmer inside it.
       *
       * Both are their own scrollport and neither is painted by a walk over
       * the library's routes, so they are opened by hash the way
       * `modals.spec.ts` does it: clicking a card is a race against
       * thumbnails an ffmpeg queue has not finished yet.
       */
      if (id === null) continue;

      for (const view of [
        { hash: `#/clips/${id}`, name: 'clip-panel', settle: 2500 },
        // The frame strip is an ffmpeg job away, and the marks column beside it
        { hash: `#/trim/${id}`, name: 'trim', settle: 4500 },
      ]) {
        await ctx.page.evaluate((h) => {
          window.location.hash = h;
        }, view.hash);
        await ctx.page.waitForTimeout(view.settle);
        await look(`${width}px ${view.name}`);
      }
    }

    // A walk that looked at nothing reports nothing, which looks the same.
    expect(checked, `only ${checked} screens were measured`).toBeGreaterThan(24);
    console.log(`measured ${checked} screens`);

    expect(problems, `Sideways overflow:\n${problems.join('\n')}`).toEqual([]);
  });
});
