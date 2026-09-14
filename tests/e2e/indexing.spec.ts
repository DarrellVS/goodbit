import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * What counts as a recording, and what is the app's own litter.
 *
 * A trim writes its output beside the clip, because the swap at the end has to
 * be a rename on one volume. That folder is watched, so for as long as the cut
 * takes, a file that looked exactly like a new recording sat in a game folder:
 * the library gained a second clip named `....tmp-1789421332922.mp4`, dated
 * today, while the real clip kept its own date.
 */
test.describe('indexing', () => {
  let ctx: TestApp;

  const call = (method: string, path: string, body?: unknown, query?: unknown) =>
    ctx.page.evaluate(
      ([m, p, b, q]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: (q ?? {}) as Record<string, unknown>,
        }),
      [method, path, body, query] as const,
    );

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'ScanGame', 1, 2);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a trim in progress is not a new clip', async () => {
    const dir = join(ctx.videosRoot, 'ScanGame');
    const source = join(dir, 'ScanGame_clip_0.mp4');

    // Both shapes: what a trim writes now, and what one written before they
    // were hidden left behind when it failed midway.
    copyFileSync(source, join(dir, '.goodbit-trim-ScanGame_clip_0-1789421332922.mp4'));
    copyFileSync(source, join(dir, 'ScanGame_clip_0.tmp-1789421332922.mp4'));

    await call('POST', '/scan');

    const clips = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'ScanGame' })).body as {
      items: Array<{ filename: string }>;
    };

    const names = clips.items.map((c) => c.filename);
    expect(names).toEqual(['ScanGame_clip_0.mp4']);
  });
});
