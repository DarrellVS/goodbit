import { expect, test } from '@playwright/test';
import { existsSync, statSync, utimesSync } from 'node:fs';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * A clip can hold more than one GoodBit.
 *
 * Everything here needs a database, which is why it is not in `tests/unit`:
 * the range arithmetic and the render's filename are unit tested, and what is
 * left is whether the rows behave with a real library underneath them. The
 * tests run in order and build on each other, the way the trim and compress
 * specs do; the marks made in the first one are what the render test renders.
 *
 * **What this spec cannot prove.** Deleting a clip is supposed to take its
 * GoodBits with it, by foreign key rather than by code, and an orphaned row is
 * invisible from outside: no route can ask for a GoodBit without naming a clip
 * that no longer exists. What is observable, and is the failure that would
 * actually hurt somebody, is the other direction: a foreign key that refused
 * the delete rather than cascading it would make every marked clip
 * undeletable. So the delete is driven and asserted to succeed. That the rows
 * are gone rather than orphaned rests on the schema, `ON DELETE CASCADE` plus
 * TypeORM's sqlite driver opening every connection with
 * `PRAGMA foreign_keys = ON`.
 */
test.describe('GoodBits', () => {
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

  interface Listed {
    id: number;
    filePath: string;
    filename: string;
    game: string;
    durationSec: number | null;
    recordedAt: string | null;
    fileModifiedAt: string;
    displayName: string | null;
  }

  interface Marked {
    id: number;
    clipId: number;
    startSec: number;
    endSec: number;
    durationSec: number;
    name: string | null;
    source: string;
    reason: string | null;
    confidence: number | null;
  }

  const GAME = 'GoodBitGame';

  const clips = async (): Promise<Listed[]> =>
    ((await call('GET', '/clips', undefined, { pageSize: 50, game: GAME })).body as {
      items: Listed[];
    }).items;

  /**
   * One of the seeded recordings, by name.
   *
   * By name rather than by index, because a rendered GoodBit lands in this
   * same folder and therefore in this same list, and where it sorts depends on
   * what somebody called it.
   */
  const recording = async (index: number): Promise<Listed> => {
    const wanted = `${GAME}_clip_${index}.mp4`;
    const found = (await clips()).find((clip) => clip.filename === wanted);
    expect(found, `${wanted} should be indexed`).toBeTruthy();
    return found!;
  };

  const goodBits = async (clipId: number): Promise<Marked[]> =>
    ((await call('GET', `/clips/${clipId}/goodbits`)).body as { items: Marked[] }).items;

  /** August, to the millisecond. The date a render must not replace with today. */
  const RECORDED_AT = new Date('2026-08-01T20:15:00.000Z');

  test.beforeAll(async () => {
    ctx = await launchApp();
    // Six seconds, so there is room for two GoodBits that do not touch.
    const seeded = seedClips(ctx.videosRoot, GAME, 2, 6);
    /*
     * Backdated before the app indexes them.
     *
     * `recordedAt` is taken from the file's own date the first time a clip is
     * seen, and a render writes a new file whose date is the moment it ran. If
     * both were "now" the assertion that the recording's date was carried
     * across would pass whether or not anything carried it.
     */
    for (const file of seeded) utimesSync(file, RECORDED_AT, RECORDED_AT);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a clip carries several marked ranges, in the order they happen', async () => {
    const clip = await recording(0);
    expect(clip.recordedAt).toBe(RECORDED_AT.toISOString());

    // Marked out of order on purpose: the list is read against a timeline, so
    // it comes back in clip order rather than in the order somebody marked it.
    const second = await call('POST', `/clips/${clip.id}/goodbits`, {
      startSec: 3.5,
      endSec: 5,
      name: 'the tank',
    });
    const first = await call('POST', `/clips/${clip.id}/goodbits`, { startSec: 0.5, endSec: 2 });

    expect(second.status).toBe(201);
    expect(first.status).toBe(201);

    const marked = await goodBits(clip.id);
    expect(marked.map((m) => m.startSec)).toEqual([0.5, 3.5]);
    expect(marked.map((m) => m.name)).toEqual([null, 'the tank']);
    // Marking by hand is the common case, and it owes nobody an explanation.
    expect(marked.map((m) => m.source)).toEqual(['manual', 'manual']);
    expect(marked.map((m) => m.reason)).toEqual([null, null]);
    expect(marked[0].durationSec).toBeCloseTo(1.5, 3);
  });

  test('a detected one keeps the sentence the detector wrote', async () => {
    const clip = await recording(1);

    const res = await call('POST', `/clips/${clip.id}/goodbits`, {
      startSec: 1,
      endSec: 3,
      source: 'hud',
      reason: 'the kill feed lit up',
      confidence: 0.94,
    });
    const made = res.body as Marked;

    expect(res.status).toBe(201);
    expect(made.source).toBe('hud');
    expect(made.reason).toBe('the kill feed lit up');
    expect(made.confidence).toBeCloseTo(0.94, 2);

    expect((await call('DELETE', `/clips/${clip.id}/goodbits/${made.id}`)).status).toBe(200);
  });

  test('a range the clip cannot hold is refused in words', async () => {
    const clip = await recording(0);

    const past = await call('POST', `/clips/${clip.id}/goodbits`, { startSec: 1, endSec: 99 });
    expect(past.status).toBe(400);
    expect((past.body as { error: string }).error).toContain('cannot end after the clip');

    const backwards = await call('POST', `/clips/${clip.id}/goodbits`, { startSec: 4, endSec: 2 });
    expect(backwards.status).toBe(400);

    const nothing = await call('POST', `/clips/${clip.id}/goodbits`, { startSec: 4 });
    expect(nothing.status).toBe(400);

    // The table's own CHECK would have stopped all three. What is being
    // checked is that none of them arrived as a 500 with SQL in it.
    for (const res of [past, backwards, nothing]) {
      expect(JSON.stringify(res.body)).not.toContain('SQLITE');
    }
  });

  test('a GoodBit can be renamed and moved, on its own clip only', async () => {
    const clip = await recording(0);
    const marked = (await goodBits(clip.id))[0];

    const patched = await call('PATCH', `/clips/${clip.id}/goodbits/${marked.id}`, {
      name: 'the good one',
      endSec: 2.75,
    });
    expect(patched.status).toBe(200);
    expect((patched.body as Marked).name).toBe('the good one');
    expect((patched.body as Marked).endSec).toBeCloseTo(2.75, 3);
    // The edge that was not sent stays where it was.
    expect((patched.body as Marked).startSec).toBeCloseTo(marked.startSec, 3);

    const elsewhere = await recording(1);
    const wrongClip = await call('PATCH', `/clips/${elsewhere.id}/goodbits/${marked.id}`, {
      name: 'not yours',
    });
    expect(wrongClip.status).toBe(404);
  });

  test('rendering one writes a new clip and leaves the recording alone', async () => {
    const clip = await recording(0);
    const before = statSync(clip.filePath);
    const marked = (await goodBits(clip.id)).find((m) => m.name === 'the tank')!;

    const started = await call('POST', `/clips/${clip.id}/goodbits/${marked.id}/render`);
    expect(started.status).toBe(202);
    const { jobId } = started.body as { jobId: string };

    interface JobView {
      status: string;
      error: string | null;
      clip: Listed | null;
    }
    const job = async (): Promise<JobView> =>
      (await call('GET', `/clips/jobs/${jobId}`)).body as JobView;

    // A re-encode of six seconds of 640x360 is quick, and it is still an
    // ffmpeg on whatever machine this runs on.
    await expect
      .poll(async () => (await job()).status, { timeout: 120_000, intervals: [500] })
      .not.toBe('running');

    const finished = await job();
    expect(finished.error).toBeNull();
    expect(finished.status).toBe('done');

    const rendered = finished.clip!;
    expect(existsSync(rendered.filePath)).toBe(true);
    // A GoodBit of a Battlefield clip is a Battlefield clip: same folder, and
    // `game` is the folder name, so there is nothing to decide.
    expect(rendered.game).toBe(clip.game);
    expect(rendered.filename).toContain('the tank');
    expect(rendered.displayName).toBe('the tank');
    expect(rendered.durationSec ?? 0).toBeCloseTo(marked.endSec - marked.startSec, 1);

    /*
     * The date of the recording, not of the render.
     *
     * The cut writes a new file, so its mtime is the moment somebody pressed
     * save. Taking that as the clip's date moved an August recording into
     * today's group, which is the same bug a trim had, and fixed.
     */
    expect(rendered.recordedAt).toBe(RECORDED_AT.toISOString());
    expect(new Date(rendered.fileModifiedAt).getTime()).toBeGreaterThan(RECORDED_AT.getTime());

    // The source is untouched, bytes and marks both. That is the whole
    // difference between rendering a GoodBit and trimming a clip.
    const after = statSync(clip.filePath);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect((await goodBits(clip.id)).length).toBe(2);
  });

  test('deleting a GoodBit twice is not an error the second time', async () => {
    const clip = await recording(0);
    const marked = (await goodBits(clip.id))[0];

    expect((await call('DELETE', `/clips/${clip.id}/goodbits/${marked.id}`)).status).toBe(200);
    expect((await call('DELETE', `/clips/${clip.id}/goodbits/${marked.id}`)).status).toBe(404);
    expect((await goodBits(clip.id)).map((m) => m.id)).not.toContain(marked.id);
  });

  test('a marked clip can still be deleted, and the render outlives it', async () => {
    const clip = await recording(0);
    const rendered = (await clips()).find((c) => c.filename.includes('the tank'))!;
    expect((await goodBits(clip.id)).length).toBeGreaterThan(0);

    /*
     * A clip row carries the only copy of its tags, notes, stars and
     * collections, so the delete path is not a place for a surprise. A foreign
     * key pointing at it that refused rather than cascaded would turn marking
     * a clip into a decision nobody could take back.
     */
    const deleted = await call('DELETE', `/clips/${clip.id}`);
    expect(deleted.status).toBe(200);
    expect((await clips()).map((c) => c.id)).not.toContain(clip.id);

    // A render is a clip in its own right, and nothing about it points back.
    expect(existsSync(rendered.filePath)).toBe(true);
  });
});
