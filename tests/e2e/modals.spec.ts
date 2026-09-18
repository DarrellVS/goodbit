import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';
import {
  assertParserWorks,
  collectTextRuns,
  contrast,
  excused,
  floorFor,
  FREEZE_CSS,
} from './contrast';

/**
 * The two layers, which the screen walk cannot reach.
 *
 * `screens.spec.ts` drives routes, and the clip panel and the trimmer are not
 * routes: they are a layer over the library, deliberately, so the grid stays
 * mounted underneath. That left the two screens somebody spends the most time
 * in as the only ones the contrast gate never measured.
 *
 * They are also where the app is densest, which is exactly where a text colour
 * over a tinted ground goes wrong.
 */
test.describe('the clip layer, in both palettes', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'ModalGame', 3);
    await ctx.page.waitForTimeout(10000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  async function clipId(): Promise<number> {
    return ctx.page.evaluate(async () => {
      const answer = await window.goodbit!.apiRequest({
        method: 'GET',
        path: '/clips',
        query: { pageSize: 1 },
      });
      return (answer.body as { items: Array<{ id: number }> }).items[0].id;
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: the clip panel and the trimmer are readable`, async () => {
      await ctx.page.evaluate((t) => localStorage.setItem('goodbit-theme', t), theme);
      await ctx.page.reload();
      await ctx.page.waitForTimeout(1200);

      const id = await clipId();
      const problems: string[] = [];
      let measured = 0;

      for (const view of [
        { hash: `#/clips/${id}`, name: 'clip detail', settle: 2500 },
        { hash: `#/trim/${id}`, name: 'trim', settle: 4000 },
      ]) {
        await ctx.page.evaluate((h) => {
          window.location.hash = h;
        }, view.hash);
        // A video reports its own size only once the metadata has loaded, and
        // the trimmer's frame strip is an ffmpeg job away.
        await ctx.page.waitForTimeout(view.settle);
        await ctx.page.addStyleTag({ content: FREEZE_CSS });

        await ctx.page.screenshot({
          path: `test-results/screens/${theme}-${view.name.replace(' ', '-')}.png`,
        });

        const runs = await ctx.page.evaluate(collectTextRuns);
        assertParserWorks(runs);

        /*
         * Per view, because the floor is across both and a shortfall in one of
         * them is invisible in the total. `over-video:` is the rule that
         * excuses most of what is in here: a run counts as over video when any
         * ancestor's subtree holds a `video`, `canvas` or `img`, which in a
         * layer built around a player is nearly everything.
         */
        const excusedHere = runs.filter((run) => excused(run)).length;
        console.log(
          `${theme} ${view.name}: ${runs.length} runs, ${excusedHere} excused`,
        );

        for (const run of runs) {
          if (excused(run)) continue;
          measured++;
          const ratio = contrast(run.fg, run.bg);
          const floor = floorFor(run);
          if (ratio < floor) {
            problems.push(
              `${view.name}: "${run.text}" ${ratio.toFixed(2)}:1, wanted ${floor}:1 ` +
                `[${run.large ? 'large' : 'body'}] ` +
                `fg rgb(${run.fg.map(Math.round)}) on bg rgb(${run.bg.map(Math.round)}) ` +
                `at ${run.where}`,
            );
          }
        }
      }

      /*
       * A fixture clip is sparse: no notes, no tags, no GoodBits, a generated
       * two-second file. Thirty-odd runs is what the two layers hold for one
       * of those, and the floor is here to catch a walk that found nothing,
       * not to assert a rich clip.
       */
      expect(measured, `only ${measured} text runs were measured across both layers`)
        .toBeGreaterThan(25);
      console.log(`${theme}: measured ${measured} text runs across the two layers`);

      expect(problems, `Text below the contrast floor in ${theme}:\n${problems.join('\n')}`)
        .toEqual([]);
    });
  }

  /**
   * The layer keeps the size 2.x gave it.
   *
   * The design mockup draws a smaller centred panel and that is one place the
   * implementation deliberately does not follow it: these are 3440x1440
   * recordings, and the reason to open a clip is to look at the picture.
   * `inset-8` is a margin, not a dialog.
   */
  test('the clip layer is nearly the whole window', async () => {
    const id = await clipId();
    await ctx.page.evaluate((h) => {
      window.location.hash = h;
    }, `#/clips/${id}`);
    await ctx.page.waitForTimeout(2500);

    const fit = await ctx.page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      if (!panel) return null;
      const box = panel.getBoundingClientRect();
      return {
        widthGap: Math.round(window.innerWidth - box.width),
        heightGap: Math.round(window.innerHeight - box.height),
      };
    });

    expect(fit, 'the clip panel was not found').not.toBeNull();
    // 32px of margin on each side, and nothing has quietly turned it into a
    // centred dialog with a max-width.
    expect(fit!.widthGap).toBeLessThanOrEqual(80);
    expect(fit!.heightGap).toBeLessThanOrEqual(80);
  });
});
