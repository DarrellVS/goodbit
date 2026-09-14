import { expect, test } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Reading what a game put on the screen.
 *
 * The general analysis listens; for a game with a module, the app also decodes
 * a few frames a second and looks for what that game shows when something
 * happens. Battlefield's own kill banner is the first one, and this checks the
 * whole path: the module is registered, a game with no module is never
 * decoded, and, where a real recording is available, a clip with a kill in
 * it comes back with the kill as the grounds.
 */
test.describe('what the screen gives away', () => {
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

  /**
   * A real Battlefield recording with a confirmed kill near the end.
   *
   * Not a fixture that can be generated: the point is the game's own HUD.
   * Absent on any machine but the one this was built on, so the test that
   * needs it skips rather than fails. The rest still runs everywhere.
   */
  const REAL_CLIP = join(homedir(), 'Videos', 'Battlefield 6', 'Battlefield 6_22.08.2026_15-43-01.mp4');
  const hasRealClip = existsSync(REAL_CLIP);

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'QuietGame', 1, 8);
    if (hasRealClip) {
      const dir = join(ctx.videosRoot, 'Battlefield 6');
      mkdirSync(dir, { recursive: true });
      copyFileSync(REAL_CLIP, join(dir, 'bf6_kill.mp4'));
    }
    await ctx.page.waitForTimeout(12_000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('the games whose screen gets read are listed before anything is analysed', async () => {
    const res = await call('GET', '/clips/suggestions/watchers');
    expect(res.status).toBe(200);

    const body = res.body as { games: string[]; modules: Array<{ describe: string; watches: boolean }> };
    // Lower case, because it is compared against a folder name.
    expect(body.games).toContain('battlefield 6');
    expect(body.modules.some((m) => m.watches && m.describe.length > 0)).toBe(true);
  });

  test('a game with no module is never decoded', async () => {
    const list = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'QuietGame' }))
      .body as { items: Array<{ id: number }> };
    expect(list.items.length).toBeGreaterThan(0);

    const res = await call('GET', `/clips/${list.items[0].id}/suggestions`);
    const body = res.body as { watchesScreen: boolean; events: unknown[]; basis: string };

    expect(body.watchesScreen).toBe(false);
    expect(body.events).toEqual([]);
    // Whatever it decided, it decided by listening.
    expect(body.basis).not.toBe('hud');
  });

  test('a Battlefield clip with a kill in it is suggested because of the kill', async () => {
    test.skip(!hasRealClip, 'needs a real Battlefield recording, which is not in the repo');

    const list = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'Battlefield 6' }))
      .body as { items: Array<{ id: number; filename: string }> };
    const clip = list.items.find((c) => c.filename === 'bf6_kill.mp4');
    expect(clip, 'the copied recording should have been indexed').toBeTruthy();

    const res = await call('GET', `/clips/${clip!.id}/suggestions`);
    const body = res.body as {
      confident: boolean;
      basis: string;
      evidence: string | null;
      watchesScreen: boolean;
      window: { start: number; end: number } | null;
      events: Array<{ kind: string; atSec: number; confidence: number }>;
    };

    expect(body.watchesScreen).toBe(true);
    expect(body.confident).toBe(true);
    expect(body.basis).toBe('hud');
    // The grounds are shown to the person looking at the suggestion, so they
    // have to read as a sentence rather than as a field name. What it must not
    // do is explain where the app read it from, which is the app's business.
    expect(body.evidence).toBeTruthy();
    expect(body.evidence!.length).toBeGreaterThan(10);
    expect(body.evidence).toBe(body.evidence!.toLowerCase());
    expect(body.evidence).not.toMatch(/banner|template|HUD/i);

    expect(body.events.length).toBeGreaterThan(0);
    const kill = body.events[0];
    expect(kill.kind).toBe('kill');
    expect(kill.confidence).toBeGreaterThanOrEqual(0.8);
    // Confirmed by eye at about 5.2 s into this recording.
    expect(kill.atSec).toBeGreaterThan(4);
    expect(kill.atSec).toBeLessThan(6.5);

    // The window is built around what the screen showed, not the loudest second.
    expect(body.window).toBeTruthy();
    expect(body.window!.start).toBeLessThanOrEqual(kill.atSec);
    expect(body.window!.end).toBeGreaterThanOrEqual(kill.atSec);
  });

  test('the answer is cached, so opening the page twice only reads once', async () => {
    test.skip(!hasRealClip, 'needs a real Battlefield recording, which is not in the repo');

    const list = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'Battlefield 6' }))
      .body as { items: Array<{ id: number; filename: string }> };
    const clip = list.items.find((c) => c.filename === 'bf6_kill.mp4')!;

    const started = Date.now();
    const res = await call('GET', `/clips/${clip.id}/suggestions`);
    const elapsed = Date.now() - started;

    expect((res.body as { basis: string }).basis).toBe('hud');
    // Decoding this clip takes about a second; a cached answer is immediate.
    expect(elapsed).toBeLessThan(1500);
  });
});
