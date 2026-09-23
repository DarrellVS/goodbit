import { expect, test } from '@playwright/test';
import { launchApp, waitForClips, seedClips, type TestApp } from './app';

/**
 * The transport: media over `goodbit://`, data over IPC, and no socket at all.
 *
 * These assert the shape of the plumbing rather than any screen, so they stay
 * true as the UI is reworked.
 */
test.describe('the bridge', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 2);
    // The watcher settles the files before indexing them.
    await waitForClips(ctx.page, 2);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('the preload exposes the bridge and no port', async () => {
    const shape = await ctx.page.evaluate(() => ({
      hasBridge: !!window.goodbit,
      hasApiRequest: typeof window.goodbit?.apiRequest === 'function',
      // A loopback port would be reachable by every other process on the machine.
      leaksPort: 'apiPort' in (window.goodbit ?? {}),
    }));

    expect(shape.hasBridge).toBe(true);
    expect(shape.hasApiRequest).toBe(true);
    expect(shape.leaksPort).toBe(false);
  });

  test('data routes answer over IPC', async () => {
    const clips = await ctx.page.evaluate(() =>
      window.goodbit!.apiRequest({ method: 'GET', path: '/clips', query: { pageSize: 5 } }),
    );

    expect(clips.status).toBe(200);
    expect(Array.isArray((clips.body as { items?: unknown[] }).items)).toBe(true);
  });

  test('a non-2xx still reports its status', async () => {
    const missing = await ctx.page.evaluate(() =>
      window.goodbit!.apiRequest({ method: 'GET', path: '/clips/999999' }),
    );
    expect(missing.status).toBeGreaterThanOrEqual(400);

    const unknown = await ctx.page.evaluate(() =>
      window.goodbit!.apiRequest({ method: 'GET', path: '/no-such-route' }),
    );
    expect(unknown.status).toBe(404);
  });

  test('media is served over the protocol, with ranges', async () => {
    const first = await ctx.page.evaluate(async () => {
      const res = await fetch('goodbit://media/clip/1');
      return { status: res.status, type: res.headers.get('content-type') };
    });

    expect(first.status).toBe(200);
    expect(first.type).toContain('video');

    // Without a partial response a <video> element cannot seek.
    const ranged = await ctx.page.evaluate(async () => {
      const res = await fetch('goodbit://media/clip/1', { headers: { Range: 'bytes=0-1023' } });
      return { status: res.status, range: res.headers.get('content-range') };
    });

    expect(ranged.status).toBe(206);
    expect(ranged.range).toMatch(/^bytes 0-1023\//);
  });

  test('a thumbnail is generated and served', async () => {
    const thumb = await ctx.page.evaluate(async () => {
      const res = await fetch('goodbit://media/thumb/1');
      return { status: res.status, type: res.headers.get('content-type') };
    });

    expect(thumb.status).toBe(200);
    expect(thumb.type).toContain('image');
  });

  test('the watcher indexed the seeded clips', async () => {
    /*
     * Waited for rather than assumed.
     *
     * Indexing is a watcher event, a settle delay and a scan, and this used to
     * read the answer once after a fixed sleep. That held while the suite was
     * short and turned into a flake as it grew: the same assertion passed on
     * its own and failed in the middle of a full run, which is the least
     * useful kind of failure.
     */
    await expect
      .poll(
        async () => {
          const clips = await ctx.page.evaluate(() =>
            window.goodbit!.apiRequest({ method: 'GET', path: '/clips', query: { pageSize: 50 } }),
          );
          return (clips.body as { items: Array<{ game: string }> }).items;
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toEqual(expect.arrayContaining([expect.objectContaining({ game: 'TestGame' })]));

    const clips = await ctx.page.evaluate(() =>
      window.goodbit!.apiRequest({ method: 'GET', path: '/clips', query: { pageSize: 50 } }),
    );
    expect((clips.body as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(2);
  });
});
