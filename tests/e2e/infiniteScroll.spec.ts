import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The library grows as you scroll, and does not mix two lists while doing it.
 *
 * Issue #3. The page bar is gone, so what used to be "does Next fetch page
 * two" is now four separate questions, and the last is the one that can
 * corrupt what is on screen rather than just annoy somebody:
 *
 * 1. More arrives, and what was already there stays where it was.
 * 2. The end of the list says it is the end, because a grid that simply stops
 *    reads as a grid that failed.
 * 3. Scrolling is enough, with nothing pressed.
 * 4. **A page in flight when the filters change must not be appended.** The
 *    store's stale-response guard is a request id, which answers "is this
 *    response still wanted" and not "does it belong to the list underneath".
 *    Change the game while page two is in the air and the newest id belongs to
 *    the page, so it lands on top of page one of the *old* filter and the grid
 *    shows two games at once under a filter naming one.
 *
 * **Nothing here asserts an exact first-page count**, and that is not
 * vagueness. The trigger fills the window before it waits: while the foot of
 * the list is within 800px of the viewport it keeps asking, so the number the
 * library settles on depends on the window, the card size and the view mode.
 * A test that demanded five would be asserting the window's height.
 */

const MAIN_GAME = 30;
const OTHER_GAME = 3;
const TOTAL = MAIN_GAME + OTHER_GAME;

test.describe('the library loads as you scroll', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    ctx = await launchApp();
    // Enough that filling the window still leaves somewhere to scroll to.
    seedClips(ctx.videosRoot, 'TestGame', MAIN_GAME, 1);
    seedClips(ctx.videosRoot, 'OtherGame', OTHER_GAME, 1);

    // Ask the indexer rather than sleeping at it.
    for (let attempt = 0; attempt < 60; attempt++) {
      const total = await ctx.page.evaluate(async () => {
        const answer = await window.goodbit!.apiRequest({
          method: 'GET',
          path: '/clips',
          query: { pageSize: 1 },
        });
        return (answer.body as { total: number }).total;
      });
      if (total >= TOTAL) break;
      await ctx.page.waitForTimeout(2000);
    }

    /*
     * Five per page, so the window takes several pages to fill and the end is
     * still a long way down.
     *
     * `goodbit-public-config` is the key `useConfiguration` writes, a flat
     * object rather than one nested under `public`.
     */
    await ctx.page.evaluate(() => {
      const KEY = 'goodbit-public-config';
      try {
        const config = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        localStorage.setItem(KEY, JSON.stringify({ ...config, pageSize: 5 }));
      } catch {
        localStorage.setItem(KEY, JSON.stringify({ pageSize: 5 }));
      }
    });
    await ctx.page.reload();
    await ctx.page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  /**
   * One per clip in the list.
   *
   * `[data-clip-slot]` rather than `article.clip-card`: a slot is a clip's
   * place in the grid and is always there, while the card inside it is only
   * mounted near the window. Counting cards would count the window.
   */
  const cards = () => ctx.page.locator('[data-clip-slot]');
  const loadMore = () => ctx.page.getByRole('button', { name: /^Load more$/ });

  /**
   * Back to every clip, at the top, and settled.
   *
   * Settled matters: the trigger fills the window, so the count climbs for a
   * second or two after the route arrives and any assertion made during that
   * is a race. This waits for it to stop moving rather than sleeping at it.
   */
  async function reset(): Promise<number> {
    /*
     * A reload, not a route change, and that is deliberate.
     *
     * Going away and back leaves the store holding the previous test's list
     * and `main` holding its scroll offset, and with a list that fills the
     * window on its own those two are enough to change the answer: left
     * scrolled near the bottom, the foot of the list stays in sight and the
     * library keeps fetching until there is nothing left to fetch, so the
     * Load more button this waits for never appears. A reload starts every
     * test from the same place. `pageSize` is in `localStorage`, so it
     * survives one.
     */
    await ctx.page.reload();
    await ctx.page.waitForTimeout(1500);

    // The first page has landed, and there is more than it.
    await expect(loadMore()).toHaveCount(1, { timeout: 20_000 });

    /*
     * Then wait for the count to stop moving.
     *
     * The trigger fills the window before it waits, so the number climbs for
     * a second after the first page and any assertion made during that is a
     * race.
     */
    let last = -1;
    for (let attempt = 0; attempt < 30; attempt++) {
      await ctx.page.waitForTimeout(600);
      const now = await cards().count();
      if (now === last && now > 0) return now;
      last = now;
    }
    return last;
  }

  test('a page at a time, and what was there stays where it was', async () => {
    const settled = await reset();

    expect(settled, 'the window should not have swallowed the whole library').toBeLessThan(TOTAL);
    await expect(loadMore()).toHaveCount(1);
    await expect(ctx.page.getByText(`${settled} of ${TOTAL}`)).toBeVisible();

    /*
     * What is on screen now has to still be on screen, in the same order.
     *
     * By the slot's clip id rather than by its text: a slot holds a card only
     * while it is near the window, so reading the first one's text after the
     * page has moved compares a rendered card against an empty box.
     */
    const before = await cards().first().getAttribute('data-clip-slot');

    await loadMore().click();
    await expect.poll(async () => cards().count(), { timeout: 10_000 }).toBeGreaterThan(settled);
    expect(await cards().first().getAttribute('data-clip-slot')).toBe(before);
  });

  test('the end of the list says so', async () => {
    await reset();

    for (let press = 0; press < 20; press++) {
      if (!(await loadMore().count())) break;
      await loadMore().click();
      await ctx.page.waitForTimeout(600);
    }

    await expect(cards()).toHaveCount(TOTAL);
    await expect(loadMore()).toHaveCount(0);
    await expect(ctx.page.getByText(`That is all ${TOTAL} clips.`)).toBeVisible();
  });

  test('scrolling to the bottom is enough, with nothing pressed', async () => {
    const settled = await reset();
    expect(settled).toBeLessThan(TOTAL);

    /*
     * Straight to the bottom. The sentinel carries 800px of margin so this
     * crosses it well before the last row arrives, which is the point: a page
     * that only starts loading once the end is visible ends in a spinner.
     */
    await ctx.page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = main.scrollHeight;
    });

    await expect.poll(async () => cards().count(), { timeout: 10_000 }).toBeGreaterThan(settled);
  });

  test('a filter change beats a page that is still in the air', async () => {
    await reset();

    /*
     * Ask for the next page and change the question before it lands.
     *
     * No `await` on the click: the point is to have a request in flight. The
     * filter is set through the sidebar's own game row, so this goes the way a
     * person would.
     */
    void loadMore().click();
    await ctx.page.getByRole('button', { name: /OtherGame/ }).first().click();
    await ctx.page.waitForTimeout(3000);

    // Three clips, all of them the other game, and no trace of the first list.
    await expect(cards()).toHaveCount(OTHER_GAME);
    await expect(ctx.page.getByText(`That is all ${OTHER_GAME} clips.`)).toBeVisible();

    const text = await ctx.page.locator('main').textContent();
    expect(text, "the old filter's clips should be gone entirely").not.toContain('TestGame_clip');
  });
});
