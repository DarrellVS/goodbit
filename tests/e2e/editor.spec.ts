import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Editor controls that do what they are labelled, and a timeline whose blocks
 * stay inside their track.
 *
 * Zoom was inverted in three places at once. The handlers, the disabled
 * guards, and therefore the readout, which is the shape of bug that survives
 * being read: everything agreed with everything else, and all of it was
 * backwards.
 */
test.describe('the editor', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    // Long enough that the timeline exceeds its 1000px minimum width, or a
    // block can never reach the end of its track and the overhang cannot show.
    seedClips(ctx.videosRoot, 'TestGame', 2, 26);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  async function openEditor(): Promise<void> {
    await ctx.page.evaluate(() => {
      window.location.hash = '#/editor';
    });
    await ctx.page.waitForTimeout(1500);
  }

  const readZoom = async (): Promise<number> => {
    const text = await ctx.page.locator('span').filter({ hasText: /^\d+%$/ }).first().textContent();
    return Number((text ?? '').replace('%', ''));
  };

  test('zooming in makes the timeline bigger, not smaller', async () => {
    await openEditor();

    const before = await readZoom();
    await ctx.page.getByTitle('Zoom in').click();
    await ctx.page.waitForTimeout(400);

    expect(await readZoom(), 'zooming in should raise the zoom').toBeGreaterThan(before);

    await ctx.page.getByTitle('Zoom out').click();
    await ctx.page.getByTitle('Zoom out').click();
    await ctx.page.waitForTimeout(400);

    expect(await readZoom(), 'zooming out should lower it').toBeLessThan(before);
  });

  test('a clip never hangs past the end of its track', async () => {
    await openEditor();

    // Put a clip on the timeline; the last one is where the overhang showed.
    await ctx.page.locator('img[src^="goodbit://media/thumb"]').first().click();
    await ctx.page.waitForTimeout(1200);

    for (const zoom of ['none', 'in', 'in'] as const) {
      if (zoom === 'in') {
        await ctx.page.getByTitle('Zoom in').click();
        await ctx.page.waitForTimeout(400);
      }

      const overhang = await ctx.page.evaluate(() => {
        // The clip blocks sit inside the video lane; neither may extend past it.
        const lane = document.querySelector('.h-16.rounded-lg');
        if (!lane) return null;

        const laneRight = lane.getBoundingClientRect().right;
        const blocks = Array.from(lane.querySelectorAll(':scope > div'));

        return blocks.reduce(
          (worst, block) => Math.max(worst, block.getBoundingClientRect().right - laneRight),
          0,
        );
      });

      expect(overhang, 'a clip is wider than the track it sits in').toBeLessThanOrEqual(1);
    }
  });

  test('the empty music lane opens the music panel', async () => {
    await openEditor();

    await ctx.page.getByText(/Music lane/).click();
    await ctx.page.waitForTimeout(600);

    await expect(ctx.page.getByText('Drop files or click', { exact: false })).toBeVisible();
  });
});
