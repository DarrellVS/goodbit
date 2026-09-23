import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp, waitForClips } from './app';

/**
 * The editor drafts migration, against a real database.
 *
 * 3.2 collapsed two draft stores into one: named drafts now live only in
 * `project`, and IndexedDB keeps one scratch record for "what was this window
 * doing when it closed". The migration that carries a 1.x store across is 44
 * unit tests deep and had **never touched a database**.
 *
 * It is worth a spec for one specific reason. Preserving a draft's real date is
 * impossible through the repository, because TypeORM sets
 * `@UpdateDateColumn` unconditionally on every `save`, so the action writes
 * that column with a raw statement in the driver's own storage format: UTC, a
 * space rather than a `T`, three decimals, no suffix. If that format is wrong
 * by one character, `AbstractSqliteDriver.prepareHydratedValue` hands back
 * `Invalid Date` on the way out, and **every migrated draft shows as having no
 * date at all**. A unit test can check the string; only a round trip through a
 * real database and back out through hydration can check the date.
 *
 * The reason the date matters rather than being cosmetic: `updatedAt` is what
 * the drafts list sorts and prints, so a broken one makes months-old work
 * either undated or the newest thing in the library.
 */
test.describe('the editor drafts migration', () => {
  let ctx: TestApp;

  interface ProjectRow {
    id: number;
    name: string;
    updatedAt: string;
    timeline?: unknown;
  }

  interface ImportResult {
    results: Array<{ localId: string; outcome: string; projectId?: number; reason?: string }>;
    created: number;
    updated: number;
    kept: number;
    skipped: number;
  }

  const call = async <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: T }> =>
    (await ctx.page.evaluate(
      ([m, p, b]) =>
        window.goodbit!.apiRequest({ method: m as string, path: p as string, body: b, query: {} }),
      [method, path, body] as const,
    )) as { status: number; body: T };

  const projects = async (): Promise<ProjectRow[]> => {
    const { body } = await call<{ items: ProjectRow[] } | ProjectRow[]>('GET', '/projects');
    return Array.isArray(body) ? body : body.items;
  };

  /** A 1.x local record, as the renderer would hand it over. */
  const draft = (over: Partial<Record<string, unknown>> = {}) => ({
    localId: 'local-1',
    name: 'Montage',
    updatedAt: '2026-08-14T20:15:00.000Z',
    clips: [{ clipId: 1, startTime: 0, trimStart: 0, trimEnd: 2, volume: 1, muted: false }],
    audio: [],
    ...over,
  });

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'TestGame', 2, 2);
    await waitForClips(ctx.page, 2);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a leftover draft becomes a row and keeps its own date', async () => {
    const { status, body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [draft()],
    });

    expect(status).toBe(200);
    expect(body.created).toBe(1);

    const rows = await projects();
    const migrated = rows.find((row) => row.name === 'Montage');
    expect(migrated).toBeTruthy();

    /*
     * The assertion this spec exists for.
     *
     * A readable date, not `Invalid Date`, and **August rather than today**.
     * Stamping the migration's own moment would read "just now" about work
     * months old and make it the newest thing in the list.
     */
    const when = new Date(migrated!.updatedAt);
    console.log(`migrated updatedAt: ${migrated!.updatedAt} -> ${when.toISOString()}`);

    expect(Number.isNaN(when.getTime())).toBe(false);
    expect(when.getUTCFullYear()).toBe(2026);
    expect(when.getUTCMonth()).toBe(7); // August, zero indexed
    expect(when.getUTCDate()).toBe(14);
  });

  test('running it again changes nothing, because the row is recognised', async () => {
    const before = await projects();

    const { body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [draft({ projectId: before.find((r) => r.name === 'Montage')!.id })],
    });

    expect(body.kept).toBe(1);
    expect(body.created).toBe(0);

    const after = await projects();
    expect(after.length).toBe(before.length);
  });

  test('a newer local copy overwrites the row, and carries its name', async () => {
    const rows = await projects();
    const row = rows.find((r) => r.name === 'Montage')!;

    const { body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [
        draft({
          projectId: row.id,
          name: 'Montage, final',
          updatedAt: '2026-09-01T10:00:00.000Z',
        }),
      ],
    });

    expect(body.updated).toBe(1);

    const after = await projects();
    const updated = after.find((r) => r.id === row.id)!;
    // Half a record winning is not a rule: the name comes across with the
    // timeline.
    expect(updated.name).toBe('Montage, final');
    expect(new Date(updated.updatedAt).getUTCMonth()).toBe(8); // September
  });

  test('a record whose row has gone becomes a row of its own', async () => {
    // The case a naive dedupe would drop: `projectId` set, row deleted. A
    // draft imported from a file never had a row at all, and the same applies.
    const { body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [draft({ localId: 'orphan', name: 'Orphaned', projectId: 999999 })],
    });

    expect(body.created).toBe(1);
    expect((await projects()).some((r) => r.name === 'Orphaned')).toBe(true);
  });

  test('an empty record is skipped and not turned into a row', async () => {
    const { body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [draft({ localId: 'empty', name: 'Nothing', clips: [], audio: [] })],
    });

    expect(body.skipped).toBe(1);
    expect(body.created).toBe(0);
    expect((await projects()).some((r) => r.name === 'Nothing')).toBe(false);
  });

  test('a date it cannot parse never wins a conflict', async () => {
    /*
     * The store has no schema, so a stamp can be anything. Compared as text,
     * `'yesterday' > '2026-08-14T...'` is true, which would let a hand-written
     * record overwrite a real row's timeline.
     */
    const rows = await projects();
    const row = rows.find((r) => r.name === 'Montage, final')!;

    const { body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [draft({ projectId: row.id, name: 'Should not win', updatedAt: 'yesterday' })],
    });

    expect(body.updated).toBe(0);

    const after = await projects();
    expect(after.find((r) => r.id === row.id)!.name).toBe('Montage, final');
  });

  test('every kind at once, which is what a real machine looks like', async () => {
    const rows = await projects();
    const existing = rows.find((r) => r.name === 'Montage, final')!;

    const { body } = await call<ImportResult>('POST', '/projects/import', {
      drafts: [
        draft({ localId: 'a', name: 'Kept', projectId: existing.id }),
        draft({ localId: 'b', name: 'Fresh one' }),
        draft({ localId: 'c', name: 'Empty', clips: [], audio: [] }),
        draft({ localId: 'd', name: 'Orphan two', projectId: 888888 }),
      ],
    });

    console.log(`mixed import: ${JSON.stringify(body)}`);

    expect(body.kept).toBe(1);
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1);
    expect(body.results).toHaveLength(4);

    // Every created row has to be readable, with a real date.
    for (const result of body.results.filter((r) => r.outcome === 'created')) {
      const row = (await projects()).find((r) => r.id === result.projectId);
      expect(row, result.localId).toBeTruthy();
      expect(Number.isNaN(new Date(row!.updatedAt).getTime())).toBe(false);
    }
  });
});
