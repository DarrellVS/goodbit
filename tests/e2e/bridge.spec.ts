import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

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
    await ctx.page.waitForTimeout(9000);
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
    const clips = await ctx.page.evaluate(() =>
      window.goodbit!.apiRequest({ method: 'GET', path: '/clips', query: { pageSize: 50 } }),
    );

    const items = (clips.body as { items: Array<{ game: string }> }).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((c) => c.game === 'TestGame')).toBe(true);
  });
});
