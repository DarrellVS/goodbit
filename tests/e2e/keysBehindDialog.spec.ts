import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The library stops listening while a clip is open over it.
 *
 * `ClipDetailModal` opens *over* `ClipsPage`, which stays mounted with the
 * scroll keys bound to its own list. So `ArrowUp` and `ArrowDown` pressed
 * inside an open clip were also moving the library underneath it, and nothing
 * on screen said so: you close the panel and the library is somewhere else.
 *
 * Found while adding frame stepping to the trimmer, which wants the arrows for
 * the handles and had to take them in the capture phase to get them at all.
 * That is the symptom rather than the cause, so the guard is in
 * `useClipListKeyboardShortcuts`, which fixes it for every view of an open clip
 * and for both screens that show a list.
 *
 * **This used to be about paging**, and read the page number off the pager's
 * own "Showing page N of M". Issue #3 removed the pager: the library grows as
 * you scroll and `page-next` and `page-previous` no longer exist. The scroll
 * keys are what is left of the same question, and the readout is the scroll
 * offset, which is the thing they move.
 */
test.describe('keys behind an open clip', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    // Enough clips that the library is taller than the window and can scroll.
    seedClips(ctx.videosRoot, 'TestGame', 12, 1);
    await ctx.page.waitForTimeout(14_000);
    await ctx.page.reload();
    await ctx.page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  /** How far down the library is, read off the element that scrolls. */
  const offset = async (): Promise<number> =>
    ctx.page.evaluate(() => document.querySelector('main')?.scrollTop ?? -1);

  /**
   * Put focus somewhere that is not a clip and not a control.
   *
   * Clicking at a guessed coordinate in the middle of the page lands on a clip
   * card, which opens the panel, and the key is then correctly suppressed: an
   * earlier version of the control test was failing because it had triggered
   * the very thing it was controlling for. The library's own title is plain
   * text and reacts to nothing.
   */
  const focusNothing = async (): Promise<void> => {
    await ctx.page.getByText('My Library').first().click();
    await expect(ctx.page.getByRole('dialog')).toHaveCount(0);
  };

  /**
   * Park the list at a given offset.
   *
   * After `focusNothing`, never before: clicking the title scrolls it into
   * view, so anything set beforehand is undone by the click itself. That is
   * what made the third test assert "less than zero".
   */
  const parkAt = async (offsetPx: number): Promise<void> => {
    await ctx.page.evaluate((top) => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = top;
    }, offsetPx);
    await ctx.page.waitForTimeout(300);
  };

  test('arrow keys scroll the library when nothing is open', async () => {
    // The control. If this does not move, the test below proves nothing.
    await focusNothing();
    await parkAt(0);

    await ctx.page.keyboard.press('ArrowDown');
    await ctx.page.waitForTimeout(900);

    const after = await offset();
    console.log(`with nothing open, ArrowDown moved the library to ${after}`);
    expect(after).toBeGreaterThan(0);
  });

  test('and stop scrolling it the moment a clip is open over it', async () => {
    await focusNothing();
    await parkAt(300);
    const behind = await offset();

    await ctx.page.locator('article.clip-card').first().click();
    await expect(ctx.page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 });

    // Several presses, because one could be swallowed by something focused.
    for (let i = 0; i < 3; i++) {
      await ctx.page.keyboard.press('ArrowDown');
      await ctx.page.waitForTimeout(250);
    }

    await ctx.page.keyboard.press('Escape');
    await expect(ctx.page.getByRole('dialog').first()).toBeHidden({ timeout: 10_000 });
    await ctx.page.waitForTimeout(800);

    const after = await offset();
    console.log(`behind the dialog: ${behind} -> ${after} after closing`);

    /*
     * A scroll step is 300px, so anything under a third of one is not the key.
     *
     * Closing the panel puts focus back on the card that opened it, and the
     * browser brings a focused element fully into view, which moved the list
     * by 22px in measurement. That is the panel handing focus back, not the
     * library answering a key it should not have heard.
     */
    expect(Math.abs(after - behind)).toBeLessThan(100);
  });

  test('and take them back once it closes', async () => {
    await focusNothing();
    await parkAt(300);
    const before = await offset();

    await ctx.page.keyboard.press('ArrowUp');
    await ctx.page.waitForTimeout(900);

    expect(await offset()).toBeLessThan(before);
  });
});
