import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, makeVideo, type TestApp } from './app';

/**
 * What a library costs once the list stops paging: the measurement issue #3
 * asks for before anything is virtualised.
 *
 * **Off unless asked for**, with `GOODBIT_SCALE=1`. It copies three hundred
 * clips into a throw-away root, waits for the indexer and the thumbnail queue,
 * and then scrolls to the bottom a page at a time, printing what each page
 * costs. That is minutes, and it answers a question rather than guarding
 * against a regression, so it does not belong in the gate.
 *
 * The number that decides virtualisation is **the renderer's working set**,
 * not the JS heap. A clip card is a `<video preload="none">` with a 1280 wide
 * poster, and a poster is decoded outside the heap entirely: a full resolution
 * one measured 181 KB on disk and 18.9 MB decoded, which is why the thumbnail
 * width is pinned. `getAppMetrics` reports the real figure per process, so
 * this asks Electron rather than the page.
 *
 * `npx playwright test tests/e2e/scale.spec.ts` with `GOODBIT_SCALE=1`.
 */

const HOW_MANY = 300;
const RUN = process.env.GOODBIT_SCALE === '1';

interface Sample {
  loaded: number;
  nodes: number;
  heapMb: number;
  rendererMb: number;
  /** The worst frame during a scroll of one window, in ms. */
  worstFrameMs: number;
}

test.describe(RUN ? 'the cost of a library that does not page' : 'scale (set GOODBIT_SCALE=1)', () => {
  test.skip(!RUN, 'A measurement, not a gate. GOODBIT_SCALE=1 to run it.');

  let ctx: TestApp;

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    ctx = await launchApp();

    /*
     * One real clip, copied. Three hundred ffmpeg runs would be most of the
     * wall time of this test, and the indexer, the thumbnail queue and the
     * grid cannot tell the difference: each copy is its own file with its own
     * mtime, its own row and its own thumbnail.
     */
    const dir = join(ctx.videosRoot, 'ScaleGame');
    mkdirSync(dir, { recursive: true });
    const source = join(dir, 'ScaleGame_clip_0.mp4');
    makeVideo(source);
    for (let i = 1; i < HOW_MANY; i++) {
      copyFileSync(source, join(dir, `ScaleGame_clip_${i}.mp4`));
    }

    /*
     * Wait for the indexer, by asking rather than by sleeping.
     *
     * A fixed sleep was wrong in both directions: the first run measured 37
     * clips because the library had fetched while the scan was still walking
     * the folder, and a sleep long enough to be safe is a sleep wasted on
     * every run after that.
     */
    for (let attempt = 0; attempt < 120; attempt++) {
      const total = await ctx.page.evaluate(async () => {
        const answer = await window.goodbit!.apiRequest({
          method: 'GET',
          path: '/clips',
          query: { pageSize: 1 },
        });
        return (answer.body as { total: number }).total;
      });
      if (total >= HOW_MANY) break;
      await ctx.page.waitForTimeout(2000);
    }
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('scrolling to the bottom, a page at a time', async () => {
    test.setTimeout(600_000);

    /*
     * Away and back, so the list is fetched after the scan rather than during
     * it. The library mounts at launch and fetches once; setting the hash to
     * the route it is already on changes nothing.
     */
    await ctx.page.evaluate(() => {
      window.location.hash = '#/stats';
    });
    await ctx.page.waitForTimeout(800);
    await ctx.page.evaluate(() => {
      window.location.hash = '#/';
    });
    await ctx.page.waitForTimeout(3500);

    const rendererMb = async (): Promise<number> => {
      const metrics = await ctx.app.evaluate(async ({ app }) => app.getAppMetrics());
      const renderer = metrics
        .filter((entry) => entry.type === 'Tab')
        .sort((a, b) => (b.memory?.workingSetSize ?? 0) - (a.memory?.workingSetSize ?? 0))[0];
      return Math.round(((renderer?.memory?.workingSetSize ?? 0) / 1024) * 10) / 10;
    };

    const sample = async (): Promise<Sample> => {
      const inPage = await ctx.page.evaluate(async () => {
        const main = document.querySelector('main');

        /*
         * The worst frame while the list is actually moving.
         *
         * An average hides the answer: a list that drops one frame in forty
         * scrolls fine and a list that drops a 200ms one does not, and both
         * average the same.
         */
        const gaps: number[] = [];
        let last = performance.now();
        let frames = 0;
        await new Promise<void>((done) => {
          const tick = (): void => {
            const now = performance.now();
            gaps.push(now - last);
            last = now;
            if (main) main.scrollTop += 60;
            frames += 1;
            if (frames < 40) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });

        const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

        return {
          nodes: document.querySelectorAll('*').length,
          cards: document.querySelectorAll('article.clip-card').length,
          heapMb: Math.round(((heap?.usedJSHeapSize ?? 0) / 1024 / 1024) * 10) / 10,
          // The first gap is the delay before the loop starts, not a frame.
          worstFrameMs: Math.round(Math.max(...gaps.slice(1)) * 10) / 10,
        };
      });

      return {
        loaded: inPage.cards,
        nodes: inPage.nodes,
        heapMb: inPage.heapMb,
        rendererMb: await rendererMb(),
        worstFrameMs: inPage.worstFrameMs,
      };
    };

    const samples: Sample[] = [await sample()];

    // Down to the bottom, letting each page arrive before measuring the next.
    for (let page = 0; page < 12; page++) {
      const more = ctx.page.getByRole('button', { name: /^Load more$/ });
      if (!(await more.count())) break;
      await more.click();
      await ctx.page.waitForTimeout(2500);
      samples.push(await sample());
    }

    console.log('');
    console.log('clips  nodes   heap MB  renderer MB  worst frame ms');
    for (const row of samples) {
      console.log(
        `${String(row.loaded).padStart(5)}  ${String(row.nodes).padStart(5)}  ` +
          `${String(row.heapMb).padStart(7)}  ${String(row.rendererMb).padStart(11)}  ` +
          `${String(row.worstFrameMs).padStart(14)}`,
      );
    }
    console.log('');

    const last = samples[samples.length - 1];
    expect(samples.length, 'the list should have grown at least once').toBeGreaterThan(1);
    expect(last.loaded, 'the list should hold more than one page by the end').toBeGreaterThan(50);

    /*
     * The bar the issue sets, in both directions.
     *
     * A worst frame over 50ms is a visible stutter, and a renderer over a
     * gigabyte is the case that would make virtualisation worth its own
     * complexity. Failing here is the answer "yes, virtualise", not a defect.
     */
    expect(last.worstFrameMs, `worst frame at ${last.loaded} clips`).toBeLessThan(50);
    expect(last.rendererMb, `renderer working set at ${last.loaded} clips`).toBeLessThan(1024);
  });
});
