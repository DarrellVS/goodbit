import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp, waitForClips } from './app';

/**
 * Searching the library, which until now could not find a note.
 *
 * `GET /clips` matched `q` with four `LIKE '%q%'` clauses over `filename`,
 * `displayName` and a joined `tag.name`. It never looked at `notes`, which is
 * the one place somebody wrote down what actually happened in a clip, and it
 * matched inside words, so `cs` returned most of a Windows library.
 *
 * It now goes through `clip_search`, an FTS5 index over filename, displayName,
 * notes and game, maintained by triggers. This spec is the only proof that the
 * triggers really fire: `clipSearch.spec.ts` covers turning input into a MATCH
 * expression, and `migration-check.mjs` covers the index being backfilled, but
 * **neither watches a row change and the index follow**.
 */
test.describe('search', () => {
  let ctx: TestApp;

  interface ClipRow {
    id: number;
    filename: string;
    notes: string | null;
    displayName: string | null;
  }

  const call = async <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: unknown,
  ): Promise<T> => {
    const response = (await ctx.page.evaluate(
      ([m, p, b, q]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: (q ?? {}) as Record<string, unknown>,
        }),
      [method, path, body, query] as const,
    )) as { status: number; body: T };

    if (response.status >= 400) {
      throw new Error(`${method} ${path} answered ${response.status}: ${JSON.stringify(response.body)}`);
    }
    return response.body;
  };

  /** Filenames matching a search, which is what every test here asks. */
  const found = async (q: string): Promise<string[]> => {
    const page = await call<{ items: ClipRow[] }>('GET', '/clips', undefined, {
      q,
      pageSize: '200',
    });
    return page.items.map((clip) => clip.filename).sort();
  };

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'Battlefield 6', 3, 2);
    seedClips(ctx.videosRoot, 'Counter Strike', 2, 2);
    await waitForClips(ctx.page, 5);

    const { items } = await call<{ items: ClipRow[] }>('GET', '/clips', undefined, {
      pageSize: '200',
    });
    expect(items.length).toBe(5);

    // A note on one clip, which is the thing search could never see.
    const target = items.find((clip) => clip.filename === 'Battlefield 6_clip_0.mp4')!;
    await call('PATCH', `/clips/${target.id}`, {
      notes: 'the helicopter crash at the bridge, hilarious',
    });

    // And a display name on another, which it could.
    const renamed = items.find((clip) => clip.filename === 'Battlefield 6_clip_1.mp4')!;
    await call('PATCH', `/clips/${renamed.id}`, { displayName: 'Tank standoff' });
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a note is findable, which is the whole point', async () => {
    expect(await found('helicopter')).toEqual(['Battlefield 6_clip_0.mp4']);
    expect(await found('bridge')).toEqual(['Battlefield 6_clip_0.mp4']);
  });

  test('the index follows an edit, because the triggers fire', async () => {
    const { items } = await call<{ items: ClipRow[] }>('GET', '/clips', undefined, {
      q: 'helicopter',
      pageSize: '10',
    });
    const clip = items[0]!;

    await call('PATCH', `/clips/${clip.id}`, { notes: 'a quiet walk through a house' });

    // The old terms have to be retired, not just the new ones added. This is
    // the half of an FTS5 external-content trigger that is easy to get wrong:
    // the delete has to be given the row's *old* values.
    expect(await found('helicopter')).toEqual([]);
    expect(await found('quiet')).toEqual([clip.filename]);

    // Put it back for the tests that follow.
    await call('PATCH', `/clips/${clip.id}`, {
      notes: 'the helicopter crash at the bridge, hilarious',
    });
    expect(await found('helicopter')).toEqual([clip.filename]);
  });

  test('a display name and a game are findable too', async () => {
    expect(await found('standoff')).toEqual(['Battlefield 6_clip_1.mp4']);

    // Typing the game is the same action as filtering by it, and making
    // somebody use two controls to say one thing is how a search gets
    // abandoned.
    expect((await found('Counter')).length).toBe(2);
  });

  test('two words narrow, rather than returning either', async () => {
    // Both terms, in the same clip. `helicopter tank` matches neither.
    expect(await found('helicopter bridge')).toEqual(['Battlefield 6_clip_0.mp4']);
    expect(await found('helicopter standoff')).toEqual([]);
  });

  test('results appear while the word is still being typed', async () => {
    for (const partial of ['heli', 'helic', 'helico']) {
      expect(await found(partial), partial).toEqual(['Battlefield 6_clip_0.mp4']);
    }
  });

  test('it matches whole words, not letters inside them', async () => {
    // The old behaviour: `cs` matched every path containing those letters.
    // Nothing here is named `cs`, and `Counter Strike` must not answer to it.
    expect(await found('cs')).toEqual([]);
    // `rid` is inside `bridge` and is not a word in it.
    expect(await found('rid')).toEqual([]);
  });

  test('what somebody types can never be a query operator', async () => {
    /*
     * Each of these is a syntax error or a different query if it reaches FTS5
     * unquoted, and a syntax error here is a 500 on the library screen rather
     * than an empty result. That is the failure this is guarding against.
     */
    for (const hostile of [
      "don't",
      'NOT helicopter',
      'helicopter OR tank',
      'rocket" OR notes:"secret',
      'NEAR(a b)',
      '^start',
      '-minus',
      '*',
      '""',
      'notes:helicopter',
    ]) {
      // The assertion is that it answers at all.
      await expect(found(hostile), hostile).resolves.toBeDefined();
    }
  });

  test('a search too short to mean anything filters nothing', async () => {
    // One character matches most of a library, so it is not a search yet.
    expect((await found('a')).length).toBe(5);
    expect((await found('')).length).toBe(5);
  });

  test('a clip that is deleted leaves the index', async () => {
    const { items } = await call<{ items: ClipRow[] }>('GET', '/clips', undefined, {
      q: 'standoff',
      pageSize: '10',
    });
    const clip = items[0]!;

    await call('DELETE', `/clips/${clip.id}`);
    expect(await found('standoff')).toEqual([]);
  });
});
