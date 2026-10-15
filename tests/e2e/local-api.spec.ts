import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { request, type IncomingMessage } from 'node:http';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, makeVideo, type TestApp } from './app';

/**
 * The local API, spoken the way another program on this PC would speak it.
 *
 * The switch is turned on through Settings, the pipe is found through
 * `local-api.json`, and everything after that is real HTTP over the real
 * named pipe from this test process, so what is asserted is the whole path a
 * client takes and not a handler called in isolation.
 */

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

type Line = Record<string, unknown> & { type: string };

test.describe('the local API', () => {
  let ctx: TestApp;
  let pipe = '';
  let stream: IncomingMessage | null = null;
  let session = '';
  let quit = false;
  const lines: Line[] = [];

  /** One request and one reply over the pipe. */
  function call(
    method: 'GET' | 'POST',
    path: string,
    options: { session?: boolean; body?: unknown } = {},
  ): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const payload = options.body === undefined ? null : JSON.stringify(options.body);
      const req = request(
        {
          socketPath: pipe,
          path,
          method,
          headers: {
            ...(options.session ? { 'GoodBit-Session': session } : {}),
            ...(payload
              ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            try {
              resolve({
                status: res.statusCode ?? 0,
                body: JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as Record<string, unknown>,
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on('error', reject);
      req.end(payload ?? undefined);
    });
  }

  /** Open the event stream and keep every line it sends. */
  function subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = request({ socketPath: pipe, path: '/v1/events', method: 'GET' }, (res) => {
        stream = res;
        let buffered = '';
        res.setEncoding('utf-8');
        res.on('data', (text: string) => {
          buffered += text;
          let newline = buffered.indexOf('\n');
          while (newline >= 0) {
            const raw = buffered.slice(0, newline);
            buffered = buffered.slice(newline + 1);
            newline = buffered.indexOf('\n');
            if (!raw.trim()) continue;
            const line = JSON.parse(raw) as Line;
            lines.push(line);
            if (line.type === 'snapshot') {
              session = String(line.session);
              resolve();
            }
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  const sawEvent = (name: string): Line | undefined =>
    lines.find((line) => line.type === 'event' && line.event === name);

  test.beforeAll(async () => {
    ctx = await launchApp();
    await ctx.page.evaluate(() => {
      window.location.hash = '#/settings?section=connections';
    });
    await ctx.page.getByRole('switch', { name: 'Let other apps reach this library' }).click();

    const discovery = join(ctx.dataDir, 'local-api.json');
    await expect.poll(() => existsSync(discovery), { timeout: 30_000, intervals: [250] }).toBe(true);
    const found = JSON.parse(readFileSync(discovery, 'utf-8')) as { pipe: string; pid: number };
    pipe = found.pipe;
    expect(pipe).toMatch(/^\\\\\.\\pipe\\goodbit-api-[0-9a-f-]{36}$/);
    expect(found.pid).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    stream?.destroy();
    // A test that quit the app itself has already ended it; the folder is all that is left.
    if (quit) rmSync(dirname(ctx.dataDir), { recursive: true, force: true });
    else await ctx?.close();
  });

  test('says hello, without offering to delete', async () => {
    const hello = await call('GET', '/v1/hello');
    expect(hello.status).toBe(200);
    const capabilities = hello.body.capabilities as string[];
    expect(capabilities).toContain('events');
    expect(capabilities).not.toContain('clips.discard');
  });

  test('a replay arrives as saving, then saved', async () => {
    await subscribe();
    expect(lines.some((line) => line.type === 'snapshot')).toBe(true);

    const staging = join(ctx.videosRoot, '.goodbit-incoming');
    mkdirSync(staging, { recursive: true });
    makeVideo(join(staging, 'GoodBit 2026-10-15 20-00-00.mp4'), 2);

    await expect.poll(() => sawEvent('clip.saving') !== undefined, { timeout: 30_000, intervals: [250] }).toBe(true);
    await expect.poll(() => sawEvent('clip.saved') !== undefined, { timeout: 60_000, intervals: [250] }).toBe(true);

    // In that order: the receipt is never earlier than the promise.
    const order = lines.filter((line) => line.type === 'event').map((line) => line.event);
    expect(order.indexOf('clip.saving')).toBeLessThan(order.indexOf('clip.saved'));

    const saved = sawEvent('clip.saved') as Line & { clip: { id: number } };
    expect(typeof saved.clip.id).toBe('number');
  });

  test('deleting is refused until it is allowed', async () => {
    const saved = sawEvent('clip.saved') as Line & { clip: { id: number } };
    const id = saved.clip.id;

    const refused = await call('POST', `/v1/clips/${id}/discard`, { session: true, body: { confirm: true } });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('capability_off');

    // Allow it through Settings, and the capability appears.
    await ctx.page.getByRole('switch', { name: 'Allow deleting clips' }).click();
    await expect
      .poll(async () => ((await call('GET', '/v1/hello')).body.capabilities as string[]).includes('clips.discard'), {
        timeout: 15_000,
        intervals: [250],
      })
      .toBe(true);

    // Past the capability check, so the next lock is the session: no session, no write.
    const anonymous = await call('POST', `/v1/clips/${id}/discard`, { body: { confirm: true } });
    expect(anonymous.status).toBe(401);

    // And stopped by the one after: nothing is
    // thrown away without `confirm: true`, so the file is left alone.
    const unconfirmed = await call('POST', `/v1/clips/${id}/discard`, { session: true, body: {} });
    expect(unconfirmed.status).toBe(400);
  });

  test('quitting takes the discovery file down, and the pipe with it', async () => {
    const discovery = join(ctx.dataDir, 'local-api.json');
    expect(existsSync(discovery)).toBe(true);
    stream?.destroy();

    quit = true;
    await ctx.app.close();

    expect(existsSync(discovery)).toBe(false);
    await expect(call('GET', '/v1/hello')).rejects.toBeTruthy();
  });
});
