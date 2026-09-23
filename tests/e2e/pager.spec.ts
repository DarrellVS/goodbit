import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp, waitForClips, settle } from './app';

/**
 * Moving between clips without closing the one you are on.
 *
 * The one thing 3.x adds rather than restyles, so it is the one thing here
 * with no earlier behaviour to fall back on. The audit found every persona
 * doing the same three-step dance to look through a session: close the clip,
 * find the next tile, open it.
 *
 * What this has to get right, and what it therefore checks:
 *
 * - The order is the library's own order, so paging walks what the grid is
 *   showing rather than what the database happens to return.
 * - It stops at both ends instead of wrapping, because a Next that lands on
 *   the first clip is indistinguishable from the app losing your place.
 * - The readout counts from one and does not move its chevrons as the number
 *   changes, which is `10-modal-pager`.
 * - `[` and `]` do it from the keyboard, and do not fire while a field has
 *   focus, or typing a bracket into a note would page the modal.
 */
test.describe('paging between clips inside the modal', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'PagerGame', 12);
    await waitForClips(ctx.page, 12);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  /**
   * Open the first tile in the grid.
   *
   * The Escape first is not ceremony. The modal is module-level state rather
   * than a route, deliberately, so the library underneath stays mounted; a
   * hash change does not close it, and a modal left open by the previous test
   * covers the grid this one is about to click.
   */
  async function openFirstClip(): Promise<void> {
    await ctx.page.keyboard.press('Escape');
    await settle(ctx.page);
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await settle(ctx.page);
    await ctx.page.locator('article').first().click();
    await expect(ctx.page.getByRole('dialog')).toBeVisible();
  }

  const readout = () => ctx.page.getByRole('status').filter({ hasText: / of / }).first();

  test('the readout counts the library, one-based', async () => {
    await openFirstClip();
    await expect(readout()).toHaveText('1 of 12');
  });

  test('next walks forward and stops at the end', async () => {
    await openFirstClip();

    const next = ctx.page.getByRole('button', { name: 'Next clip' });
    const previous = ctx.page.getByRole('button', { name: 'Previous clip' });

    // At the first clip there is nowhere back to go.
    await expect(previous).toBeDisabled();

    for (const expected of ['2 of 12', '3 of 12', '4 of 12']) {
      await next.click();
      await settle(ctx.page);
      await expect(readout()).toHaveText(expected);
    }

    // On to the last one, where there is nowhere forward. It does not wrap.
    for (let i = 5; i <= 12; i++) {
      await next.click();
      await settle(ctx.page);
    }
    await expect(readout()).toHaveText('12 of 12');
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
  });

  test('the modal is showing the clip the pager says it is', async () => {
    await openFirstClip();

    const names = await ctx.page.evaluate(() =>
      Array.from(document.querySelectorAll('article')).map(
        (card) => card.querySelector('input')?.value ?? '',
      ),
    );
    expect(names.length).toBeGreaterThanOrEqual(3);

    const next = ctx.page.getByRole('button', { name: 'Next clip' });
    await next.click();
    await settle(ctx.page);

    // The modal's own name field, which is the clip it has loaded.
    const showing = await ctx.page
      .getByRole('dialog')
      .locator('input')
      .first()
      .inputValue();
    expect(showing).toBe(names[1]);
  });

  test('the chevrons do not move as the number changes', async () => {
    await openFirstClip();

    /*
     * Freeze the animations first.
     *
     * The modal enters on a transform, so a box read the instant it becomes
     * visible is a box part way through a slide, and comparing it to a settled
     * one reports a twenty pixel drift that nobody can see. The contrast walk
     * does the same thing for the same reason.
     */
    await ctx.page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    await settle(ctx.page);

    /*
     * Measure the chevron that can actually move.
     *
     * The pager sits at the right-hand end of the header, after a `flex-1`
     * title, so a readout that grows pushes the group leftwards and the Next
     * chevron's own x does not change at all. Probing that one reported a pass
     * with the `min-width` deleted, which is the whole thing it is meant to
     * catch. The Previous chevron and the group's total width are what move.
     */
    const box = async (): Promise<{ left: number; groupWidth: number }> => {
      const rect = await ctx.page.getByRole('button', { name: 'Previous clip' }).boundingBox();
      const group = await ctx.page
        .getByRole('button', { name: 'Previous clip' })
        .locator('xpath=..')
        .boundingBox();
      return { left: Math.round(rect!.x), groupWidth: Math.round(group!.width) };
    };

    /*
     * Walk across the ten, which is the only place this can break.
     *
     * `1 of 12` and `2 of 12` are the same number of characters, so paging
     * within a decade proves nothing: the readout has to be measured at a
     * one-digit position and again at a two-digit one. That is the width the
     * `min-width` is computed for, and without it the chevrons step inward by
     * a character the moment the position reaches ten.
     */
    const before = await box();
    const next = ctx.page.getByRole('button', { name: 'Next clip' });
    for (let i = 2; i <= 10; i++) {
      await next.click();
      await settle(ctx.page);
    }
    await expect(readout()).toHaveText('10 of 12');
    const after = await box();

    expect(after.groupWidth, 'the pager changed width when the position reached two digits')
      .toBe(before.groupWidth);
    expect(after.left, 'the previous chevron moved when the position reached two digits')
      .toBe(before.left);
  });

  test('the bracket keys page, and a text field keeps its own brackets', async () => {
    await openFirstClip();

    await ctx.page.keyboard.press(']');
    await settle(ctx.page);
    await expect(readout()).toHaveText('2 of 12');

    await ctx.page.keyboard.press('[');
    await settle(ctx.page);
    await expect(readout()).toHaveText('1 of 12');

    // Inside the clip's own name field, a bracket is a bracket.
    const name = ctx.page.getByRole('dialog').locator('input').first();
    await name.click();
    const original = await name.inputValue();
    await name.press(']');
    await settle(ctx.page);

    await expect(readout()).toHaveText('1 of 12');
    expect(await name.inputValue()).not.toBe(original);

    // Put it back, so the next test in this file sees what it expects.
    await name.fill(original);
    await name.press('Escape');
  });
});
