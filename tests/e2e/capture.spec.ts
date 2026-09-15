import { existsSync, mkdirSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, makeVideo, type TestApp } from './app';

/**
 * A replay lands in staging and GoodBit files it.
 *
 * This is the half that replaced a Python interpreter and a third party
 * script, so it is the half that has to be proven. The foreground sampler
 * cannot be driven from a test (there is no game to put in front), so what is
 * asserted here is everything around the guess: the clip leaves staging,
 * lands under a game folder in the library, keeps the recording's own date,
 * and is not indexed while it is still in staging.
 */
test.describe('filing a replay', () => {
  let ctx: TestApp;

  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a clip in staging is moved into the library, keeping its date', async () => {
    const staging = join(ctx.videosRoot, '.goodbit-incoming');
    mkdirSync(staging, { recursive: true });

    const dropped = join(staging, 'GoodBit 2026-09-15 20-00-00.mp4');
    makeVideo(dropped, 2);

    // A recording from August, which is the case that has bitten twice: the
    // file's mtime is the only record of when the moment happened, and a move
    // that stamps it with "now" files it under today for ever.
    const august = new Date('2026-08-02T19:30:00Z');
    utimesSync(dropped, august, august);

    // The watcher waits for the write to settle before it touches anything.
    await expect
      .poll(() => existsSync(dropped), { timeout: 30_000, intervals: [500] })
      .toBe(false);

    const folders = readdirSync(ctx.videosRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);

    // Somewhere named, not the top level: the folder name *is* the game name,
    // so a clip at the root has no game at all.
    expect(folders.length).toBeGreaterThan(0);

    const landed = folders
      .map((folder) => join(ctx.videosRoot, folder, 'GoodBit 2026-09-15 20-00-00.mp4'))
      .find((candidate) => existsSync(candidate));

    expect(landed, `nothing landed in any of: ${folders.join(', ')}`).toBeTruthy();
    expect(statSync(landed!).mtime.getUTCMonth()).toBe(7);
  });

  test('staging is never indexed as part of the library', async () => {
    const staging = join(ctx.videosRoot, '.goodbit-incoming');
    mkdirSync(staging, { recursive: true });

    // A file that will never settle is exactly what a half written replay is.
    // If the scan reaches into staging, this shows up as a clip.
    const halfWritten = join(staging, 'still-writing.mp4');
    makeVideo(halfWritten, 1);

    const before = (await call('GET', '/clips')).body as { clips?: unknown[] };
    const names = ((before.clips ?? []) as Array<{ filePath?: string }>).map(
      (clip) => clip.filePath ?? '',
    );

    expect(names.some((path) => path.includes('.goodbit-incoming'))).toBe(false);
  });

  const call = (method: string, path: string, body?: unknown) =>
    ctx.page.evaluate(
      ([m, p, b]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: {},
        }),
      [method, path, body] as const,
    );
});
