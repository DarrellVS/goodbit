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

/**
 * How many clips to copy in. `GOODBIT_SCALE_COUNT` overrides it.
 *
 * Three hundred was the number in the issue. A thousand is the number the
 * person who uses this said his library might genuinely reach, which is the
 * one that decides whether the DOM has to be virtualised, so it is a knob
 * rather than a constant.
 */
const HOW_MANY = Number(process.env.GOODBIT_SCALE_COUNT ?? 300);
const RUN = process.env.GOODBIT_SCALE === '1';

interface Sample {
  loaded: number;
  /** Media elements alive, against cards on the page. */
  videos: number;
  nodes: number;
  heapMb: number;
  /** The real JS heap, read through the protocol rather than from the page. */
  cdpHeapMb: number;
  listeners: number;
  rendererMb: number;
  gpuMb: number;
  totalMb: number;
  /** The worst frame during a scroll of one window, in ms. */
  worstFrameMs: number;
}

/*
 * Declared only when asked for, rather than declared and skipped.
 *
 * `RELEASING.md` requires the gate to show zero skips and means it: a skip that
 * is really a wrong path looks exactly like a skip that is really missing data,
 * and both read as success. This is a bench rather than a guard, so when it is
 * switched off it contributes no tests at all.
 */
if (RUN) {
  scaleBench();
}

function scaleBench(): void {
  test.describe('the cost of a library that does not page', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    test.setTimeout(1_800_000);
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
    for (let attempt = 0; attempt < 600; attempt++) {
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
    test.setTimeout(1_800_000);

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

    /*
     * Every process, not only the renderer.
     *
     * The first version of this reported the tab alone and said 942 MB at a
     * thousand clips, while Task Manager on a real library showed 1424 MB
     * across the group at 266. The missing third is the GPU process, which
     * holds the textures for everything that has been painted, so it belongs
     * in the number this decides on.
     */
    /*
     * The heap and the DOM counters, through the protocol.
     *
     * `performance.memory` reported 57.5 MB at fifty clips and 57.5 MB at a
     * thousand, which is not a measurement, it is a quantised cached value.
     * `Runtime.getHeapUsage` and `Memory.getDOMCounters` are the real ones,
     * and between them they say whether a card's cost is JavaScript or DOM.
     */
    const cdp = await ctx.app.context().newCDPSession(ctx.page);

    const inspect = async (): Promise<{ cdpHeapMb: number; listeners: number }> => {
      const heap = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
      const counters = (await cdp.send('Memory.getDOMCounters')) as {
        nodes: number;
        jsEventListeners: number;
      };
      return {
        cdpHeapMb: Math.round((heap.usedSize / 1024 / 1024) * 10) / 10,
        listeners: counters.jsEventListeners,
      };
    };

    const memory = async (): Promise<{ rendererMb: number; gpuMb: number; totalMb: number }> => {
      const metrics = await ctx.app.evaluate(async ({ app }) => app.getAppMetrics());
      const mb = (kb: number): number => Math.round((kb / 1024) * 10) / 10;
      const biggest = (type: string): number =>
        Math.max(
          0,
          ...metrics
            .filter((entry) => entry.type === type)
            .map((entry) => entry.memory?.workingSetSize ?? 0),
        );

      return {
        rendererMb: mb(biggest('Tab')),
        gpuMb: mb(biggest('GPU')),
        totalMb: mb(
          metrics.reduce((sum, entry) => sum + (entry.memory?.workingSetSize ?? 0), 0),
        ),
      };
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
          /*
            * Slots, not cards.
            *
            * A slot is one clip's place in the grid and is always there; the
            * card inside it is mounted only while it is near the window, which
            * is the whole point of the change this measures. Counting cards
            * would report the size of the window rather than the length of the
            * list.
            */
          cards: document.querySelectorAll('[data-clip-slot]').length,
          videos: document.querySelectorAll('[data-clip-slot] video').length,
          heapMb: Math.round(((heap?.usedJSHeapSize ?? 0) / 1024 / 1024) * 10) / 10,
          // The first gap is the delay before the loop starts, not a frame.
          worstFrameMs: Math.round(Math.max(...gaps.slice(1)) * 10) / 10,
        };
      });

      return {
        loaded: inPage.cards,
        videos: inPage.videos,
        nodes: inPage.nodes,
        heapMb: inPage.heapMb,
        ...(await memory()),
        ...(await inspect()),
        worstFrameMs: inPage.worstFrameMs,
      };
    };

    const samples: Sample[] = [await sample()];

    /*
     * Down to the bottom by scrolling, not by pressing.
     *
     * Pressing Load more is what a keyboard user does and it is covered by
     * `infiniteScroll.spec.ts`. Here it was the wrong instrument: with
     * `content-visibility` the page's height is an estimate that firms up as
     * cards render, so the button moves while Playwright is aiming at it and
     * the click lands on the container instead. Scrolling is also what the
     * thing being measured actually costs.
     */
    for (let step = 0; step < Math.ceil(HOW_MANY / 10) + 10; step++) {
      await ctx.page.evaluate(() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = main.scrollHeight;
      });
      await ctx.page.waitForTimeout(1200);

      const next = await sample();
      const grew = next.loaded > samples[samples.length - 1].loaded;
      samples.push(next);

      if (next.loaded >= HOW_MANY) break;
      // Two samples at the same length means the list has stopped growing.
      if (!grew) break;
    }

    /*
     * And one more once it has settled.
     *
     * Every row above is taken while the list is still being scrolled through,
     * so hundreds of cards have just been mounted and unmounted and the
     * collector is behind. The question this bench answers is what it costs to
     * *be* at the bottom of a long library, not what it costs to arrive there
     * at speed, and those differ by a couple of hundred megabytes of garbage.
     */
    await cdp.send('HeapProfiler.collectGarbage');
    await ctx.page.waitForTimeout(3000);
    const settled = await sample();

    console.log('');
    console.log(
      'clips  videos  nodes   heap MB  cdp heap  listeners  renderer MB  gpu MB  all MB  worst ms',
    );
    const every = samples.length > 12 ? Math.ceil(samples.length / 10) : 1;
    for (const [index, row] of samples.entries()) {
      if (index % every !== 0 && index !== samples.length - 1) continue;
      console.log(
        `${String(row.loaded).padStart(5)}  ${String(row.videos).padStart(6)}  ` +
          `${String(row.nodes).padStart(5)}  ` +
          `${String(row.heapMb).padStart(7)}  ${String(row.cdpHeapMb).padStart(8)}  ` +
          `${String(row.listeners).padStart(9)}  ${String(row.rendererMb).padStart(11)}  ` +
          `${String(row.gpuMb).padStart(6)}  ${String(row.totalMb).padStart(6)}  ` +
          `${String(row.worstFrameMs).padStart(14)}`,
      );
    }
    console.log('');

    console.log(
      `settled: ${settled.loaded} clips, ${settled.nodes} nodes, ` +
        `${settled.cdpHeapMb} MB heap, ${settled.listeners} listeners, ` +
        `${settled.rendererMb} MB renderer, ${settled.totalMb} MB across every process`,
    );
    console.log('');

    const last = settled;
    expect(samples.length, 'the list should have grown at least once').toBeGreaterThan(1);
    expect(last.loaded, 'the list should hold more than one page by the end').toBeGreaterThan(50);

    /*
     * The bar, in both directions, and on the renderer rather than the total.
     *
     * The total across every process starts at 876 MB with fifty clips on
     * screen: the GPU process alone is 180 MB before anything is scrolled and
     * the browser process and four utilities make up most of the rest. None of
     * that moves with the length of the list, so asserting on it is asserting
     * on Electron.
     *
     * What moves is the renderer, and what it is allowed to cost is a judgement
     * rather than a law: 600 MB at a thousand clips is roughly twice what fifty
     * cost, on a machine where the app is one window. Failing either of these is
     * the answer "the DOM has to be windowed harder", not a defect.
     */
    expect(last.worstFrameMs, `worst frame at ${last.loaded} clips`).toBeLessThan(50);
    expect(last.rendererMb, `the renderer at ${last.loaded} clips`).toBeLessThan(600);
    expect(last.nodes, `DOM nodes at ${last.loaded} clips`).toBeLessThan(4000);
  });
  });
}
