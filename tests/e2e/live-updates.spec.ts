import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * A clip recorded while the window is open has to appear in it.
 *
 * This is the app's whole premise. It watches so you do not have to, and it
 * was broken without being noticeable: the service indexed clips correctly and
 * the database was right, but nothing in the renderer subscribed to the events,
 * so an open window kept showing whatever was there when it loaded until
 * someone pressed Rescan.
 *
 * Every other test asked the API directly, which is exactly why none of them
 * caught it.
 */
test.describe('the window keeps up with the watcher', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    // Deliberately no clips at launch: the window loads empty, the way it does
    // when you open the app and then record something.
    ctx = await launchApp();
    await ctx.page.waitForLoadState('networkidle').catch(() => {});
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a clip recorded now shows up without a manual rescan', async () => {
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await ctx.page.waitForTimeout(1500);

    // Nothing yet.
    const before = await ctx.page.evaluate(async () => {
      const res = await window.goodbit!.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 50 },
      });
      return (res.body as { items: unknown[] }).items.length;
    });
    expect(before).toBe(0);

    // Record two clips into the watched folder, as OBS would.
    seedClips(ctx.videosRoot, 'LiveGame', 2);

    // The UI must catch up on its own. Generous, because awaitWriteFinish
    // deliberately holds off until the file stops growing.
    await expect
      .poll(
        async () =>
          ctx.page.evaluate(() => document.body.innerText.includes('LiveGame')),
        { timeout: 30_000, intervals: [1000] },
      )
      .toBe(true);

    // And the clips themselves, not just the game in the sidebar.
    const shown = await ctx.page.evaluate(() =>
      document.querySelectorAll(
        '[data-clip-id], [data-clip-slot], img[src^="goodbit://media/thumb"]',
      ).length,
    );
    expect(shown).toBeGreaterThan(0);
  });
});

/**
 * First run has to land somewhere that explains itself.
 *
 * The guard redirected to a route that had never been added, so vue-router
 * failed the navigation and the window came up empty, a blank app with no
 * error, which is the worst version of broken.
 */
test.describe('first run', () => {
  test('with no clips folder set, the welcome screen appears', async () => {
    const ctx = await launchApp({ configured: false });

    try {
      await ctx.page.waitForTimeout(3000);

      expect(ctx.page.url()).toContain('#/welcome');
      await expect(ctx.page.getByText('Welcome to GoodBit')).toBeVisible();

      /*
       * The first run is a wizard now, and it opens by saying what GoodBit is:
       * a companion to OBS, which is the one thing a new user cannot work out
       * from a folder picker. The folder is the step after it.
       */
      await expect(ctx.page.getByText('GoodBit is a companion to OBS')).toBeVisible();
      await ctx.page.getByRole('button', { name: 'Continue' }).click();

      // The phrase also appears on the disabled confirm button; match the row.
      await expect(ctx.page.getByText('Required: choose a folder')).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
