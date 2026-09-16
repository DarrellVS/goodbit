import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The library's one filter row, and collections above the clips.
 *
 * 3.8 and 3.9 moved five things at once: Select came off a permanent floating
 * bar into the row, the tag filter came out of a popover in the header, the
 * sort control became a `BaseComboBox`, collections came out of the sidebar,
 * and Rescan went to Settings. Nothing about that is checkable by a typecheck,
 * and the agent that built it could not look at a screen.
 *
 * So this is mostly about geometry and presence: that the controls are on one
 * line rather than two, that they are the same height, that four collections
 * are visible and the fifth is behind a control, and that the two overflow
 * behaviours really are two.
 *
 * Screenshots go to `test-results/library-header/`.
 */
const SHOTS = join('test-results', 'library-header');

test.describe('the library header', () => {
  let ctx: TestApp;

  const call = async <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const response = (await ctx.page.evaluate(
      ([m, p, b]) =>
        window.goodbit!.apiRequest({ method: m as string, path: p as string, body: b, query: {} }),
      [method, path, body] as const,
    )) as { status: number; body: T };
    return response.body;
  };

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 4, 2);
    await ctx.page.waitForTimeout(9000);

    // Six, so four are visible and two are behind Show all.
    for (const name of ['Clutch', 'Funny', 'Headshots', 'Fails', 'Tank', 'Heli']) {
      await call('POST', '/collections', { name });
    }
    await ctx.page.reload();
    await ctx.page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('Rescan is no longer the biggest button on the library', async () => {
    // It triggered the backstop for a list the watcher already keeps current,
    // in the colour the app reserves for what it wants you to press.
    await expect(ctx.page.getByRole('button', { name: /^Rescan$/i })).toHaveCount(0);
    // And the header's Tags popover is gone with it.
    await expect(ctx.page.getByRole('button', { name: /^Tags$/ })).toHaveCount(0);
  });

  test('the filter row is one row, and its controls are one height', async () => {
    const select = ctx.page.getByRole('button', { name: /^Select$/ });
    await expect(select).toBeVisible({ timeout: 15_000 });

    const boxes = await ctx.page.evaluate(() => {
      const labelled = (name: string): DOMRect | null => {
        const found = [...document.querySelectorAll('button')].find(
          (b) => (b.textContent ?? '').trim() === name,
        );
        return found ? found.getBoundingClientRect() : null;
      };
      const combos = [...document.querySelectorAll('[aria-haspopup="listbox"]')].map((el) =>
        el.getBoundingClientRect(),
      );
      return {
        select: labelled('Select'),
        combos: combos.map((r) => ({ top: r.top, height: r.height, left: r.left })),
      };
    });

    console.log(`select: ${JSON.stringify(boxes.select)}`);
    console.log(`dropdowns: ${JSON.stringify(boxes.combos)}`);

    // Two dropdowns in the row: the tag filter and the sort.
    expect(boxes.combos.length).toBeGreaterThanOrEqual(2);

    // Same height, which is the whole reason `COMBO_BOX_HEIGHT` is exported.
    const heights = new Set([
      Math.round(boxes.select!.height),
      ...boxes.combos.map((c) => Math.round(c.height)),
    ]);
    expect([...heights]).toHaveLength(1);

    // And on one line: every control's top within a pixel of the others.
    const tops = [boxes.select!.top, ...boxes.combos.map((c) => c.top)].map(Math.round);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);

    await ctx.page.screenshot({ path: join(SHOTS, 'filter-row.png') });
  });

  test('four collections show, and the rest are behind one control', async () => {
    const cards = ctx.page.locator('[data-collection-card]');
    const count = await cards.count();
    console.log(`collection cards visible: ${count}`);

    // Four, with six collections in the library.
    expect(count).toBe(4);

    const toggle = ctx.page.getByRole('button', { name: /Show all/i });
    await expect(toggle).toBeVisible();
    await ctx.page.screenshot({ path: join(SHOTS, 'collections-strip.png') });

    await toggle.click();
    await ctx.page.waitForTimeout(400);
    await expect(cards).toHaveCount(6);
    await ctx.page.screenshot({ path: join(SHOTS, 'collections-grid.png') });

    // The two behaviours really are two: collapsed cannot wrap, expanded can.
    const flow = await ctx.page.evaluate(() => {
      const card = document.querySelector('[data-collection-card]');
      const row = card?.parentElement;
      return row ? getComputedStyle(row).gridAutoFlow : null;
    });
    console.log(`expanded grid-auto-flow: ${flow}`);

    await ctx.page.getByRole('button', { name: /Show less/i }).click();
    await ctx.page.waitForTimeout(400);
    await expect(cards).toHaveCount(4);
  });

  test('collections are out of the sidebar', async () => {
    // The sidebar kept a capped list of five and its own create field. There
    // is one answer to "how many are visible" now and it is in the row.
    const sidebar = ctx.page.locator('aside').first();
    await expect(sidebar.getByText('COLLECTIONS')).toHaveCount(0);
  });

  test('Select is a toggle, because the floating bar held the only Cancel', async () => {
    /*
     * The bar's third branch was "selection mode, nothing picked", and it
     * carried the only Cancel. The batch toolbar only appears once something
     * is selected, so without a toggle that state had no exit but Esc.
     */
    const select = ctx.page.getByRole('button', { name: /^Select$/ });
    await select.click();

    const cancel = ctx.page.getByRole('button', { name: /^Cancel$/ });
    await expect(cancel).toBeVisible();
    await ctx.page.screenshot({ path: join(SHOTS, 'selection-mode.png') });

    await cancel.click();
    await expect(ctx.page.getByRole('button', { name: /^Select$/ })).toBeVisible();
  });

  test('nothing floats over the library until something is selected', async () => {
    /*
     * The bar is a batch toolbar now rather than furniture, and `pb-16` came
     * off the page with it, so the last row of clips no longer sits under an
     * empty bar.
     *
     * The fixed positioner still exists in the DOM, which is fine and is why
     * this measures rather than counts: with its one branch absent it has no
     * size, so it covers nothing and cannot eat a click. An empty element that
     * still had height would be the bug, and it is invisible to a count.
     */
    const footprint = await ctx.page.evaluate(() => {
      const bar = document.querySelector('.fixed.bottom-6');
      if (!bar) return { present: false, width: 0, height: 0, hits: false };

      const box = bar.getBoundingClientRect();
      // Whatever is at the point the bar used to occupy should be the page.
      const at = document.elementFromPoint(
        Math.round(window.innerWidth / 2),
        window.innerHeight - 40,
      );
      return {
        present: true,
        width: Math.round(box.width),
        height: Math.round(box.height),
        hits: !!at?.closest('.fixed.bottom-6'),
      };
    });

    console.log(`idle floating bar: ${JSON.stringify(footprint)}`);
    expect(footprint.height).toBe(0);
    expect(footprint.hits).toBe(false);
  });
});
