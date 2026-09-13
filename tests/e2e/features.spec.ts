import { expect, test } from '@playwright/test';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The features themselves, exercised through the desktop app.
 *
 * The bridge tests prove the plumbing; these prove the things the app is for
 * still work after the port — indexing, tagging, the analysis, a lossless trim,
 * and an export that actually lands on disk.
 */
test.describe('features survive the port', () => {
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
    seedClips(ctx.videosRoot, 'TestGame', 2);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('clips are indexed under their folder name', async () => {
    const res = await call('GET', '/clips', undefined, { pageSize: 50 });
    const items = (res.body as { items: Array<{ id: number; game: string }> }).items;

    expect(items.length).toBeGreaterThanOrEqual(2);
    // The top-level folder is the game name; that contract is what keeps OBS working.
    expect(items.every((c) => c.game === 'TestGame')).toBe(true);
  });

  test('games are derived from the folders', async () => {
    const res = await call('GET', '/games');
    const games = res.body as Array<{ game: string }>;
    expect(games.some((g) => g.game === 'TestGame')).toBe(true);
  });

  test('tags can be added and read back', async () => {
    const list = await call('GET', '/clips', undefined, { pageSize: 1 });
    const id = (list.body as { items: Array<{ id: number }> }).items[0].id;

    const tagged = await call('PATCH', `/clips/${id}`, { tags: ['clutch', 'headshot'] });
    expect(tagged.status).toBe(200);

    const back = await call('GET', `/clips/${id}`);
    const tags = (back.body as { tags: string[] }).tags;
    expect(tags.sort()).toEqual(['clutch', 'headshot']);
  });

  test('the display name is metadata, never the filename', async () => {
    const list = await call('GET', '/clips', undefined, { pageSize: 1 });
    const clip = (list.body as { items: Array<{ id: number; filename: string }> }).items[0];
    const original = clip.filename;

    await call('PATCH', `/clips/${clip.id}`, { displayName: 'Renamed in the app' });

    const back = await call('GET', `/clips/${clip.id}`);
    const after = back.body as { filename: string; displayName: string };

    expect(after.displayName).toBe('Renamed in the app');
    // The file on disk must be untouched, or OBS's folder stops making sense.
    expect(after.filename).toBe(original);
  });

  test('the analysis answers, and admits when it has nothing to say', async () => {
    const list = await call('GET', '/clips', undefined, { pageSize: 1 });
    const id = (list.body as { items: Array<{ id: number }> }).items[0].id;

    const res = await call('GET', `/clips/${id}/suggestions`, undefined, { windowSec: 3 });
    const body = res.body as { analyzed: boolean; confident: boolean; reason: string | null };

    expect(res.status).toBe(200);
    // A synthetic sine tone has no dynamic range, so the honest answer is no.
    expect(body.confident).toBe(false);
    expect(body.reason).toBeTruthy();
  });

  test('tag patterns are stored server-side and match filenames', async () => {
    const saved = await call('PUT', '/tag-patterns/sniper', {
      patterns: ['sniper', '\\bawp\\b'],
      category: 'Weapons',
    });
    expect(saved.status).toBe(200);

    const all = await call('GET', '/tag-patterns');
    const found = (all.body as Array<{ tag: string; patterns: string[] }>).find(
      (p) => p.tag === 'sniper',
    );

    expect(found).toBeTruthy();
    // Sources must survive the round trip as working expressions.
    expect(new RegExp(found!.patterns[1], 'i').test('an awp clip.mp4')).toBe(true);
  });

  test('a lossless trim keeps the codec and reports where it landed', async () => {
    const list = await call('GET', '/clips', undefined, { pageSize: 50 });
    const clip = (list.body as { items: Array<{ id: number; filePath: string }> }).items[0];

    const before = statSync(clip.filePath).size;

    const res = await call('POST', `/clips/${clip.id}/trim`, {
      startSec: 0.5,
      endSec: 1.5,
      mode: 'lossless',
    });

    const body = res.body as { actualStartSec: number; actualEndSec: number; mode: string };
    expect(res.status).toBe(200);
    expect(body.mode).toBe('lossless');
    // A stream copy cannot start mid-GOP, so the reported range is what landed
    // rather than what was asked for.
    expect(typeof body.actualStartSec).toBe('number');
    expect(body.actualEndSec).toBeGreaterThan(body.actualStartSec);
    expect(statSync(clip.filePath).size).toBeLessThan(before);
  });

  test('an export renders and registers the result', async () => {
    const list = await call('GET', '/clips', undefined, { pageSize: 50 });
    const clip = (list.body as { items: Array<{ id: number }> }).items[0];

    const started = await call('POST', '/clips/export', {
      outputName: 'e2e_export',
      format: '1x1',
      normalizeLoudness: false,
      clips: [
        { clipId: clip.id, startTime: 0, trimStart: 0, trimEnd: 1, volume: 1, muted: false },
      ],
    });

    const exportId = (started.body as { exportId: string }).exportId;
    expect(exportId).toBeTruthy();

    let final: { status: string; clip: unknown } | null = null;
    for (let i = 0; i < 90; i++) {
      await ctx.page.waitForTimeout(1000);
      const poll = await call('GET', `/clips/export/${exportId}/status`);
      final = poll.body as { status: string; clip: unknown };
      if (final.status !== 'running') break;
    }

    expect(final?.status).toBe('done');
    expect(final?.clip).toBeTruthy();
    expect(statSync(join(ctx.videosRoot, 'Editor', 'e2e_export.mp4')).size).toBeGreaterThan(0);
  });

  test('publishing is absent rather than broken with no publisher', async () => {
    const list = await call('GET', '/clips', undefined, { pageSize: 1 });
    const id = (list.body as { items: Array<{ id: number }> }).items[0].id;

    const res = await call('POST', `/clips/${id}/publish`);

    // It must fail clearly, not hang or half-publish. The UI hides the action.
    expect(res.status).toBeGreaterThanOrEqual(400);
    const failure = res.body as { error?: string; message?: string };
    expect(String(failure.error ?? failure.message)).toContain('publisher');
  });
});
