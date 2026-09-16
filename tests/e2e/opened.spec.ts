import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Recording that a clip was opened, which cannot be backfilled.
 *
 * `clip.lastOpenedAt` and `clip.openCount` shipped with the 2.0 migration and
 * nothing wrote them, which is worse than not having them: a column that exists
 * and is empty reads as "never opened" for every clip in the library.
 *
 * Nothing reads them until the retention screen, so this spec is the only thing
 * standing between "collecting correctly" and "collecting nothing", and it will
 * stay that way for a release or two. That is the reason it exists rather than
 * waiting for the screen that needs it.
 */
test.describe('opening a clip is remembered', () => {
  let ctx: TestApp;

  interface Opened {
    counted: boolean;
    openCount: number;
    lastOpenedAt: string | null;
  }

  interface ClipRow {
    id: number;
    filename: string;
    openCount: number;
    lastOpenedAt: string | null;
  }

  const call = async <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: unknown,
  ): Promise<{ status: number; body: T }> =>
    (await ctx.page.evaluate(
      ([m, p, b, q]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: (q ?? {}) as Record<string, unknown>,
        }),
      [method, path, body, query] as const,
    )) as { status: number; body: T };

  const clip = async (): Promise<ClipRow> => {
    const { body } = await call<{ items: ClipRow[] }>('GET', '/clips', undefined, {
      pageSize: '10',
    });
    return body.items[0]!;
  };

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 1, 2);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a clip starts having never been opened', async () => {
    const row = await clip();

    // Null rather than zero, because "never opened" and "opened at the epoch"
    // are different claims and the first is what every row starts as.
    expect(row.lastOpenedAt).toBeNull();
    expect(row.openCount).toBe(0);
  });

  test('opening it records the time and counts it', async () => {
    const row = await clip();
    const before = Date.now();

    const { status, body } = await call<Opened>('POST', `/clips/${row.id}/opened`);
    expect(status).toBe(200);
    expect(body.counted).toBe(true);
    expect(body.openCount).toBe(1);

    const after = await clip();
    expect(after.openCount).toBe(1);
    expect(after.lastOpenedAt).not.toBeNull();
    expect(new Date(after.lastOpenedAt!).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  test('opening it again straight away moves the time but not the count', async () => {
    /*
     * The count has to measure interest rather than navigation. Closing the
     * panel and reopening it, or the modal remounting because a trim finished,
     * are each one clip being looked at once.
     *
     * The timestamp still moves, because "when did I last look at this" has a
     * right answer even when the count should not change.
     */
    const row = await clip();
    const first = row.lastOpenedAt;

    await ctx.page.waitForTimeout(1100);
    const { body } = await call<Opened>('POST', `/clips/${row.id}/opened`);

    expect(body.counted).toBe(false);
    expect(body.openCount).toBe(1);

    const after = await clip();
    expect(after.openCount).toBe(1);
    expect(new Date(after.lastOpenedAt!).getTime()).toBeGreaterThan(
      new Date(first!).getTime(),
    );
  });

  test('it writes two columns and nothing else', async () => {
    /*
     * The reason the action uses `update` by id rather than `save` on a loaded
     * entity. `save` writes every column it holds, so watching a clip would
     * move `updatedAt` on a clip nobody edited, and the FTS triggers fire on
     * any update to `clip`, so it would reindex it too.
     */
    const row = await clip();

    const { body: full } = await call<ClipRow & { updatedAt: string; notes: string | null }>(
      'GET',
      `/clips/${row.id}`,
    );
    const updatedAtBefore = full.updatedAt;

    await ctx.page.waitForTimeout(1100);
    await call('POST', `/clips/${row.id}/opened`);

    const { body: again } = await call<{ updatedAt: string }>('GET', `/clips/${row.id}`);
    expect(again.updatedAt).toBe(updatedAtBefore);
  });

  test('a clip that is gone answers 404 rather than throwing', async () => {
    // The renderer fires this and forgets it, so the failure mode that matters
    // is a 500 in the log for something nobody was waiting for.
    const { status } = await call('POST', '/clips/999999/opened');
    expect(status).toBe(404);
  });
});
