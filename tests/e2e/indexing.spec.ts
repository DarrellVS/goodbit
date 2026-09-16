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

  /**
   * Two scans at once used to insert the same clip twice.
   *
   * Nine things start a scan and none of them knew about each other: boot, the
   * six hourly sweep, the tray item, the header button, `POST /scan`, a
   * watcher add, a watcher unlink, a boot step, and every clip GoodBit files
   * for itself. Run two together over a folder holding a file with no row and
   * both find it missing, both insert it, and the second one gets
   * `SQLITE_CONSTRAINT: UNIQUE constraint failed: clip.filePath`.
   *
   * It was not theoretical. Pressing Rescan while a replay is being filed does
   * it, and so does saving two replays inside one scan, which on a few hundred
   * clips is about a second wide. `reconcile()` catches and logs, so the
   * watcher path lost the clip silently; `POST /scan` answered 500.
   *
   * `videoService.scanAndSyncClips()` now coalesces: one scan runs, anything
   * asking while it does gets one follow-up run, and every waiter is given its
   * result.
   */
  test('two scans at once do not fight over the same clip', async () => {
    // Enough files that a scan takes long enough for the second to land inside
    // it, and all of them new so every one is an insert.
    const seeded = seedClips(ctx.videosRoot, 'RaceGame', 40, 1);

    const results = await Promise.all([
      call('POST', '/scan'),
      call('POST', '/scan'),
      call('POST', '/scan'),
    ]);

    for (const response of results) {
      expect(response.status).toBe(200);
    }

    const clips = (await call('GET', '/clips', undefined, { pageSize: 200, game: 'RaceGame' }))
      .body as { items: Array<{ filename: string }>; total: number };

    // One row each, not two. A duplicate would show as a repeated filename.
    const names = clips.items.map((c) => c.filename);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(seeded.length);
  });
});
