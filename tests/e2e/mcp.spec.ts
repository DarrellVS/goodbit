import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * The tools Claude is given, driven the way Claude drives them.
 *
 * Every assertion here is a bug that shipped. The tools were written against
 * the code rather than against the protocol, so `list_tags` threw on every
 * call and nobody noticed, two tools answered the same question with different
 * numbers, and three write tools reported success for clips that do not exist.
 * A model has no way to tell it was lied to: it tells the person their clip
 * was renamed and moves on.
 *
 * So this speaks real JSON-RPC over the real HTTP transport, against a real
 * library, rather than calling the handlers directly.
 */
test.describe('the MCP server', () => {
  let ctx: TestApp;
  const port = 43251;
  const token = 'test-token-for-the-suite';
  const url = `http://127.0.0.1:${port}/mcp`;

  /** One JSON-RPC call. Stateless, so every request stands on its own. */
  async function rpc(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return (await response.json()) as Record<string, unknown>;
  }

  /** A tool's answer, parsed back out of the text block it travels in. */
  async function call(name: string, args: Record<string, unknown> = {}): Promise<never> {
    const body = await rpc('tools/call', { name, arguments: args });
    const result = body.result as { content?: Array<{ text: string }> } | undefined;
    return JSON.parse(result?.content?.[0]?.text ?? '{}') as never;
  }

  test.beforeAll(async () => {
    // The server only listens if it finds these at boot, and closing an app to
    // edit its profile deletes the profile with it, so they go in up front.
    ctx = await launchApp({
      settings: { mcpEnabled: true, mcpPort: port, mcpToken: token },
    });

    seedClips(ctx.videosRoot, 'McpGame', 2);
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('refuses anything without the token, and any Origin but its own', async () => {
    const naked = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(naked.status).toBe(401);

    // The specification makes Origin validation a MUST: without it a web page
    // you merely visit can drive this.
    const hostile = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(hostile.status).toBe(403);
  });

  test('can be initialised more than once', async () => {
    // A single long lived transport answers the first request and then returns
    // 500 for ever, because a stateless one carries no session and refuses to
    // be initialised twice.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body = await rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'suite', version: '1' },
      });
      expect(body.result, `initialize #${attempt + 1}`).toBeTruthy();
    }
  });

  test('every tool is listed, and none of them throws when called', async () => {
    const body = await rpc('tools/list');
    const tools = (body.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);

    expect(tools).toContain('search_clips');
    expect(tools).toContain('list_tags');
    expect(tools).toContain('library_stats');

    // `list_tags` threw on every call for its whole life: `Tag` owns no
    // inverse side, so asking TypeORM to load `relations: ['clips']` fails,
    // and an `as never` cast is what let it past the typechecker.
    const tags = (await call('list_tags')) as unknown as { tags: unknown[]; error?: string };
    expect(tags.error).toBeUndefined();
    expect(Array.isArray(tags.tags)).toBe(true);
  });

  test('the two tools that count games agree with each other', async () => {
    const stats = (await call('library_stats')) as unknown as { games: number };
    const listed = (await call('list_games')) as unknown as { games: unknown[] };

    // One counted rows in the `game` table, which keeps games whose clips have
    // since been moved away; the other counted games that have clips. They
    // disagreed by sixteen on a real library and nothing said why.
    expect(stats.games).toBe(listed.games.length);
  });

  test('a search says how many matched, not only how many it returned', async () => {
    /*
     * Asked of the library that is actually there.
     *
     * Hard coding "two clips were seeded" makes this a test of how fast the
     * watcher indexed rather than of what the tool reports, so the whole
     * library is counted first and the page is compared against that.
     */
    const all = (await call('search_clips', { limit: 100 })) as unknown as {
      matching: number;
      returned: number;
    };
    expect(all.matching).toBe(all.returned);
    expect(all.matching).toBeGreaterThan(0);

    const page = (await call('search_clips', { limit: 1 })) as unknown as {
      returned: number;
      matching: number;
      more?: string;
    };

    expect(page.returned).toBe(1);
    // The number that used to be missing: a page of one out of many looked
    // exactly like a library with one clip in it.
    expect(page.matching).toBe(all.matching);
    if (all.matching > 1) expect(page.more).toBeTruthy();
  });

  test('a percent sign is a character, not a wildcard', async () => {
    /*
     * `%` and `_` mean "anything" to LIKE and mean themselves to everybody
     * else. Unescaped, searching for a percent sign returned the whole
     * library, which reads as a broken search rather than a clever one.
     */
    const all = (await call('search_clips', { limit: 100 })) as unknown as { matching: number };
    const wild = (await call('search_clips', { query: '%' })) as unknown as { matching: number };

    expect(wild.matching).toBeLessThan(all.matching);

    // And an underscore, which the seeded names do not contain either.
    const underscore = (await call('search_clips', { query: '_____' })) as unknown as {
      matching: number;
    };
    expect(underscore.matching).toBe(0);
  });

  test('a date it cannot read is refused rather than ignored', async () => {
    const result = (await call('search_clips', { recordedAfter: 'yesterday' })) as unknown as {
      error?: string;
      clips?: unknown[];
    };

    // `new Date('yesterday')` is Invalid Date, and comparing against it matched
    // everything quietly, so the newest clips came back looking like an answer.
    expect(result.error).toContain('yesterday');
    expect(result.clips).toBeUndefined();
  });

  test('writing to a clip that does not exist fails, and invents nothing', async () => {
    const renamed = (await call('rename_clip', { clipId: 999999, name: 'nope' })) as unknown as {
      error?: string;
    };
    expect(renamed.error).toContain('999999');

    const noted = (await call('add_note', { clipId: 999999, note: 'nope' })) as unknown as {
      error?: string;
    };
    expect(noted.error).toContain('999999');

    const starred = (await call('star_clips', {
      clipIds: [999999],
      starred: true,
    })) as unknown as { updated: number; error?: string };
    // It used to echo the number of ids it was given, so a clip that was never
    // touched was reported as updated.
    expect(starred.updated).toBe(0);
    expect(starred.error).toBeTruthy();

    const tagged = (await call('tag_clips', {
      clipIds: [999999],
      tags: ['ghost'],
    })) as unknown as { tagged: number };
    expect(tagged.tagged).toBe(0);

    // And the tag itself was created even though it went on nothing, leaving a
    // tag in the library attached to no clip at all.
    const tags = (await call('list_tags')) as unknown as { tags: Array<{ name: string }> };
    expect(tags.tags.some((tag) => tag.name === 'ghost')).toBe(false);
  });

  test('a trim that would keep nothing is refused before the file is touched', async () => {
    const found = (await call('search_clips', { limit: 1 })) as unknown as {
      clips: Array<{ id: number; durationSec: number }>;
    };
    const clip = found.clips[0];

    const backwards = (await call('trim_clip', {
      clipId: clip.id,
      startSec: 5,
      endSec: 2,
    })) as unknown as { error?: string };
    expect(backwards.error).toBeTruthy();

    // Past the end of the recording. This is the one tool that cannot be
    // undone, so the check has to happen while it is still only a mistake.
    const pastEnd = (await call('trim_clip', {
      clipId: clip.id,
      startSec: clip.durationSec + 60,
      endSec: clip.durationSec + 90,
    })) as unknown as { error?: string };
    expect(pastEnd.error).toBeTruthy();

    // The clip is still exactly as long as it was.
    const after = (await call('get_clip', { clipId: clip.id })) as unknown as {
      durationSec: number;
    };
    expect(after.durationSec).toBe(clip.durationSec);
  });
});
