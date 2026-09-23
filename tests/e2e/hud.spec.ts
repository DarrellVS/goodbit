import { expect, test } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { launchApp, seedClips, type TestApp, waitForClips } from './app';

/**
 * Reading what a game put on the screen.
 *
 * The general analysis listens; for a game with a module, the app also decodes
 * a few frames a second and looks for what that game shows when something
 * happens. Battlefield's own kill banner is the first one, and this checks the
 * whole path: the module is registered, a game with no module is never
 * decoded, and, where a real recording is available, a clip with a kill in
 * it comes back with the kill as the grounds, and a clip with a death in it
 * comes back with the death.
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
   * Not a fixture that can be generated: the point is the game's own HUD, so
   * it has to be footage of the game. Absent on a machine with no Battlefield
   * library, where the test that needs it skips rather than fails. The rest
   * still runs everywhere.
   *
   * **Looked for in the library this machine actually has**, not only under
   * `~/Videos`. That was the videos root on the machine this was written on,
   * and hard-coding it meant the two tests below skipped on every other
   * machine, including one whose library holds the exact recording they want.
   * A skip that is really a wrong path is indistinguishable from a skip that
   * is really missing data, and it reads as "passing" either way.
   *
   * The file is only ever read: it is copied into the test's own throw-away
   * videos root, and nothing here writes to the real library.
   */
  function configuredVideosRoot(): string | null {
    const settings = join(process.env.APPDATA ?? '', 'GoodBit', 'settings.json');
    if (!existsSync(settings)) return null;
    try {
      const parsed = JSON.parse(readFileSync(settings, 'utf-8')) as { videosRoot?: string };
      return parsed.videosRoot ?? null;
    } catch {
      return null;
    }
  }

  /** Looked for in every library this machine might have, in order. */
  function findRecording(name: string): string {
    return (
      [configuredVideosRoot(), join(homedir(), 'Videos')]
        .filter((root): root is string => !!root)
        .map((root) => join(root, 'Battlefield 6', name))
        .find((candidate) => existsSync(candidate)) ?? ''
    );
  }

  const CLIP_NAME = 'Battlefield 6_22.08.2026_15-43-01.mp4';
  const REAL_CLIP = findRecording(CLIP_NAME);
  const hasRealClip = REAL_CLIP !== '';

  /**
   * Seven seconds ending in a death, with no kill anywhere in it.
   *
   * Confirmed by eye: the camera falls at about five and a half seconds, and
   * both of the lines Battlefield draws when you go down are legible from
   * about six. Deliberately a clip with nothing else in it, so a pass cannot
   * come from the kill detector finding something nearby.
   */
  const DEATH_CLIP_NAME = 'Battlefield 6_06.09.2026_20-53-57.mp4';
  const DEATH_CLIP = findRecording(DEATH_CLIP_NAME);
  const hasDeathClip = DEATH_CLIP !== '';

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'QuietGame', 1, 8);
    if (hasRealClip || hasDeathClip) {
      const dir = join(ctx.videosRoot, 'Battlefield 6');
      mkdirSync(dir, { recursive: true });
      if (hasRealClip) copyFileSync(REAL_CLIP, join(dir, 'bf6_kill.mp4'));
      if (hasDeathClip) copyFileSync(DEATH_CLIP, join(dir, 'bf6_death.mp4'));
    }
    await waitForClips(ctx.page, 1 + Number(hasRealClip) + Number(hasDeathClip));
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

  test('a Battlefield clip where you went down is suggested because of that', async () => {
    test.skip(!hasDeathClip, 'needs a real Battlefield recording, which is not in the repo');

    const list = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'Battlefield 6' }))
      .body as { items: Array<{ id: number; filename: string }> };
    const clip = list.items.find((c) => c.filename === 'bf6_death.mp4');
    expect(clip, 'the copied recording should have been indexed').toBeTruthy();

    const res = await call('GET', `/clips/${clip!.id}/suggestions`);
    const body = res.body as {
      confident: boolean;
      basis: string;
      evidence: string | null;
      window: { start: number; end: number } | null;
      events: Array<{ kind: string; atSec: number; confidence: number; reason: string }>;
    };

    expect(body.basis).toBe('hud');
    expect(body.confident).toBe(true);

    const death = body.events.find((event) => event.kind === 'death');
    expect(death, `events were: ${JSON.stringify(body.events)}`).toBeTruthy();
    expect(death!.confidence).toBeGreaterThanOrEqual(0.8);
    // The lines appear as the camera hits the ground, and the moment itself is
    // a beat before that. Confirmed by eye at about five and a half seconds.
    expect(death!.atSec).toBeGreaterThan(3.5);
    expect(death!.atSec).toBeLessThan(6.5);

    // Said as a sentence to the person looking at it, like every other reason.
    // The wording rotates, so this is what every one of them has to say rather
    // than the one it happened to pick.
    expect(death!.reason).toBe(death!.reason.toLowerCase());
    expect(death!.reason).toMatch(/went down|they got you|got dropped/);

    // A seven second clip whose death is at the end: the window has to hold it,
    // and `place` takes the last half second rather than leaving it behind.
    expect(body.window).toBeTruthy();
    expect(body.window!.start).toBeLessThanOrEqual(death!.atSec);
    expect(body.window!.end).toBeGreaterThanOrEqual(death!.atSec);
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
