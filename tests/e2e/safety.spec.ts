import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The two things that would be unforgivable to get wrong: losing the library,
 * and serving more than was asked for.
 */
test.describe('backups', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'BackupGame', 2);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a copy is taken, read back, and counted', async () => {
    const result = await ctx.page.evaluate(() => window.goodbit!.backups.now());

    expect(result.taken, result.reason).toBe(true);
    // Read back from the copy, not from the original: a backup nobody has
    // opened is a guess.
    expect(result.clips).toBeGreaterThan(0);

    const listed = await ctx.page.evaluate(() => window.goodbit!.backups.list());
    expect(listed.map((file) => file.path)).toContain(result.path);
    expect(listed[0].sizeBytes).toBeGreaterThan(0);
  });

  test('only the last five are kept', async () => {
    for (let i = 0; i < 6; i++) {
      await ctx.page.evaluate(() => window.goodbit!.backups.now());
      // The name carries a whole-second timestamp, so copies taken inside the
      // same second would overwrite each other rather than pile up.
      await ctx.page.waitForTimeout(1100);
    }

    const listed = await ctx.page.evaluate(() => window.goodbit!.backups.list());
    expect(listed.length).toBeLessThanOrEqual(5);
  });
});

test.describe('sharing on the local network', () => {
  let ctx: TestApp;
  let clipId: number;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'ShareGame', 1);
    await ctx.page.waitForTimeout(9000);

    const clips = await ctx.page.evaluate(() =>
      window.goodbit!.apiRequest({ method: 'GET', path: '/clips', query: { pageSize: 5 } }),
    );
    clipId = (clips.body as { items: Array<{ id: number }> }).items[0].id;
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('serves exactly one clip, behind an address nobody could guess', async () => {
    const state = await ctx.page.evaluate((id) => window.goodbit!.share.start(id), clipId);

    expect(state.url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/[0-9a-f]{32}$/);
    expect(state.until).toBeGreaterThan(Date.now());

    const page = await fetch(state.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<video');

    // Phones ask for pieces of the file while they play it.
    const ranged = await fetch(`${state.url}/video`, { headers: { range: 'bytes=0-99' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-length')).toBe('100');

    // The root, a guessed token, and anything outside the one file: nothing.
    const origin = new URL(state.url).origin;
    expect((await fetch(origin)).status).toBe(404);
    expect((await fetch(`${origin}/${'0'.repeat(32)}/video`)).status).toBe(404);

    await ctx.page.evaluate(() => window.goodbit!.share.stop());
    expect(await ctx.page.evaluate(() => window.goodbit!.share.current())).toBeNull();

    // And the server is actually gone, not just forgotten about.
    await expect(fetch(state.url)).rejects.toThrow();
  });

  test('a clip that is not in the library cannot be asked for', async () => {
    const failed = await ctx.page.evaluate(async () => {
      try {
        await window.goodbit!.share.start(999_999);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    });

    expect(failed).toContain('not in the library');
  });
});
