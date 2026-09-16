import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The library stops listening while a clip is open over it.
 *
 * `ClipDetailModal` opens *over* `ClipsPage`, which stays mounted with
 * `ArrowLeft` and `ArrowRight` bound to paging and the scroll keys bound to the
 * list. So arrow keys pressed inside an open clip were also turning the page
 * underneath it, and nothing on screen said so: you close the panel and the
 * library is somewhere else.
 *
 * Found while adding frame stepping to the trimmer, which wants those two keys
 * for the handles and had to take them in the capture phase to get them at all.
 * That is the symptom rather than the cause, so the guard is in
 * `useClipListKeyboardShortcuts`, which fixes it for every view of an open clip
 * and for both pages that show a list.
 */
test.describe('keys behind an open clip', () => {
  let ctx: TestApp;

  const call = async <T = unknown>(path: string, query?: unknown): Promise<T> => {
    const response = (await ctx.page.evaluate(
      ([p, q]) =>
        window.goodbit!.apiRequest({
          method: 'GET',
          path: p as string,
          query: (q ?? {}) as Record<string, unknown>,
        }),
      [path, query] as const,
    )) as { body: T };
    return response.body;
  };

  test.beforeAll(async () => {
    ctx = await launchApp();
    // More than one page of them, so paging has somewhere to go.
    seedClips(ctx.videosRoot, 'TestGame', 12, 1);
    await ctx.page.waitForTimeout(12_000);

    /*
     * Five per page, so twelve clips is three pages and paging has somewhere
     * to go. The default is 50, and without this the pagination control does
     * not render at all, which is how the first attempt at this spec failed:
     * not "paging did not happen" but "there was nothing to page".
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
   * Which page the library is on, read off the page it is drawing.
   *
   * Two earlier attempts failed and are worth recording. Comparing the first
   * thirty characters of each card's text compares `TestGame0:01·38.6 KBjust
   * now` against itself, because the seeded clips differ only in a filename
   * that is further along. And asking `GET /clips` returns the page the
   * *request* asked for, not the one the library is showing.
   *
   * The pagination control prints "Showing page N of M", which is the app
   * telling us the answer in the same words it tells the user.
   */
  const currentPageFromUi = async (): Promise<number> => {
    const text = await ctx.page.getByText(/Showing page \d+ of \d+/).first().textContent();
    const match = /Showing page (\d+) of/.exec(text ?? '');
    expect(match, `no pagination readout, got: ${text}`).toBeTruthy();
    return Number(match![1]);
  };

  /**
   * Put focus somewhere that is not a clip and not a control.
   *
   * Clicking at a guessed coordinate in the middle of the page lands on a clip
   * card, which opens the panel, and the arrow key is then correctly
   * suppressed: the control test was failing because it had triggered the very
   * thing it was controlling for. The pagination readout is plain text at the
   * bottom of the list and reacts to nothing.
   */
  const focusNothing = async (): Promise<void> => {
    await ctx.page.getByText(/Showing page \d+ of \d+/).first().click();
    await expect(ctx.page.getByRole('dialog')).toHaveCount(0);
  };

  test('arrow keys page the library when nothing is open', async () => {
    // The control. If this does not move, the test below proves nothing.
    await focusNothing();
    await ctx.page.keyboard.press('ArrowRight');
    await ctx.page.waitForTimeout(1500);

    const after = await currentPageFromUi();
    console.log(`with nothing open, ArrowRight moved to page ${after}`);
    expect(after).toBeGreaterThan(1);
  });

  test('and stop paging it the moment a clip is open over it', async () => {
    const behind = await currentPageFromUi();

    await ctx.page.locator('article.clip-card').first().click();
    await expect(ctx.page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 });

    // Several presses, because one could be swallowed by something focused.
    for (let i = 0; i < 3; i++) {
      await ctx.page.keyboard.press('ArrowRight');
      await ctx.page.waitForTimeout(250);
    }

    await ctx.page.keyboard.press('Escape');
    await expect(ctx.page.getByRole('dialog').first()).toBeHidden({ timeout: 10_000 });
    await ctx.page.waitForTimeout(800);

    const after = await currentPageFromUi();
    console.log(`behind the dialog: page ${behind} -> page ${after} after closing`);
    // Closing the panel should not reveal a list that has wandered off.
    expect(after).toBe(behind);
  });

  test('and take them back once it closes', async () => {
    const before = await currentPageFromUi();

    await focusNothing();
    await ctx.page.keyboard.press('ArrowLeft');
    await ctx.page.waitForTimeout(1500);

    expect(await currentPageFromUi()).toBeLessThan(before);
  });
});
