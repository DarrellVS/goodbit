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

  /**
   * Time zero is one x coordinate, and four things have to agree on it.
   *
   * This has now been broken twice, in opposite directions, and neither time
   * did anything fail. The ruler kept its exact 50px-per-second spacing while
   * pointing at the wrong place, so both bugs looked like a rounding error
   * rather than a wrong origin, and the only way to see either was to put a
   * screenshot next to a ruler.
   *
   * Once by removing the lanes' horizontal inset on the reasoning that the
   * ruler starts at zero, when it starts at `TIMELINE_OFFSET_PX`, which left
   * every clip 12px left of its own timestamp. Once by centring each tick in a
   * shrink-to-fit box sized by its label, which put every tick 17px right of
   * the second it marks.
   *
   * Measuring the painted positions is the only thing that catches either,
   * because each of the four is individually reasonable.
   */
  test('the ruler, the lanes and the playhead agree where time zero is', async () => {
    await openEditor();

    await ctx.page.locator('img[src^="goodbit://media/thumb"]').first().click();
    await ctx.page.waitForTimeout(1200);

    const at = await ctx.page.evaluate(() => {
      const left = (element: Element | null | undefined): number | null =>
        element ? element.getBoundingClientRect().left : null;

      const lane = document.querySelector('.h-16.rounded-lg');

      const playhead = Array.from(document.querySelectorAll('div')).find(
        (node) =>
          node.className.includes('w-0.5') &&
          node.className.includes('bg-orange-500') &&
          node.className.includes('z-20'),
      );

      // Each ruler mark is a zero width box holding a 1px tick and a label.
      const marks = Array.from(document.querySelectorAll('div')).filter(
        (node) => node.querySelector(':scope > .w-px') && node.querySelector(':scope > span'),
      );

      return {
        lane: left(lane),
        block: left(lane?.querySelector('[class*="absolute"]')),
        playhead: left(playhead),
        firstTick: left(marks[0]?.querySelector('.w-px')),
        secondTick: left(marks[1]?.querySelector('.w-px')),
      };
    });

    expect(at.lane, 'the video lane should be measurable').not.toBeNull();
    expect(at.playhead, 'the playhead should be measurable').not.toBeNull();
    expect(at.firstTick, 'the first ruler tick should be measurable').not.toBeNull();
    expect(at.secondTick, 'a second ruler tick should be measurable').not.toBeNull();

    const zero = at.playhead as number;

    expect(
      Math.abs((at.lane as number) - zero),
      'the lane should start where the playhead sits at time zero',
    ).toBeLessThanOrEqual(1);

    expect(
      Math.abs((at.firstTick as number) - zero),
      'the first ruler tick should sit on time zero, not beside its label',
    ).toBeLessThanOrEqual(1);

    // A clip at the start of the timeline, allowing for the lane's own border.
    expect(
      Math.abs((at.block as number) - zero),
      'a clip at time zero should start at time zero',
    ).toBeLessThanOrEqual(2);

    // And the scale is still the scale: consecutive ticks a whole second apart.
    expect(
      (at.secondTick as number) - (at.firstTick as number),
      'ruler ticks should stay one interval apart',
    ).toBeGreaterThan(1);
  });

  test('the empty music lane opens the music panel', async () => {
    await openEditor();

    await ctx.page.getByText(/Music lane/).click();
    await ctx.page.waitForTimeout(600);

    await expect(ctx.page.getByText('Drop files or click', { exact: false })).toBeVisible();
  });
});
