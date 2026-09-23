import { expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import multer from 'multer';
import { launchApp, seedClips, type TestApp, waitForClips } from './app';

/**
 * The marks on a clip, on their way to a public link.
 *
 * Two halves that can only be checked together. The upload carries them as a
 * text field beside the video, because multer refuses an unexpected *file* and
 * not an unexpected field, which is what lets a publisher too old to know
 * about chapters keep accepting uploads. And every later change to the marks
 * has to reach the sidecar without re-sending the video, through the same
 * `PATCH /:filename/metadata` a rename uses.
 *
 * Neither is visible in a unit test: the first is a multipart body, and the
 * second is a route answering before it pushes. What the publisher received is
 * therefore what this asserts.
 */
interface FakePublisher {
  server: Server;
  url: string;
  dir: string;
  uploads: Array<{ filename: string; goodBits?: string }>;
  patches: Array<{ filename: string; body: Record<string, unknown> }>;
  token: string;
  close: () => Promise<void>;
}

async function startFakePublisher(): Promise<FakePublisher> {
  const dir = mkdtempSync(join(tmpdir(), 'goodbit-fake-publisher-'));
  const uploads: FakePublisher['uploads'] = [];
  const patches: FakePublisher['patches'] = [];
  const app = express();
  app.use(express.json());
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => cb(null, file.originalname),
    }),
  });
  const TOKEN = 'a-test-publish-token';

  const gate: express.RequestHandler = (req, res, next) => {
    // Compared whole rather than parsed: this is a test's fake publisher,
    // and the exact header GoodBit sends is the thing being checked.
    if (req.header('authorization') !== `Bearer ${TOKEN}`) {
      res.status(401).json({ message: 'Wrong or missing publish token.' });
      return;
    }
    next();
  };

  app.post('/api/publish', gate, upload.single('file'), (req, res) => {
    const file = req.file!;
    uploads.push({
      filename: file.originalname,
      goodBits: (req.body as { goodBits?: string }).goodBits,
    });
    res.json({
      filename: file.originalname,
      url: `http://publisher.test/${file.originalname}`,
    });
  });

  app.put<{ filename: string }>(
    '/api/publish/:filename/thumbnail',
    gate,
    express.raw({ type: 'image/jpeg', limit: '8mb' }),
    (_req, res) => res.json({ stored: true }),
  );

  app.patch<{ filename: string }>('/api/publish/:filename/metadata', gate, (req, res) => {
    patches.push({ filename: req.params.filename, body: req.body as Record<string, unknown> });
    res.json({ success: true });
  });

  app.delete('/api/publish/:filename', (_req, res) => res.json({ removed: true }));

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    dir,
    uploads,
    patches,
    token: TOKEN,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

interface Mark {
  startSec: number;
  endSec: number;
  name: string | null;
  reason: string | null;
}

test.describe('the marks that go up with a published clip', () => {
  let ctx: TestApp;
  let publisher: FakePublisher;

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

  const saveSettings = (patch: Record<string, unknown>) =>
    ctx.page.evaluate((p) => window.goodbit!.saveSettings(p as never), patch);

  type Listed = { id: number; filename: string; published: boolean };
  const firstClip = async (): Promise<Listed> =>
    ((await call('GET', '/clips', undefined, { pageSize: 50, game: 'MarkGame' })).body as {
      items: Listed[];
    }).items.sort((a, b) => a.filename.localeCompare(b.filename))[0];

  /** The list the newest PATCH carried, which is what the embed page will draw. */
  const lastPatched = (): Mark[] =>
    (publisher.patches.at(-1)?.body.goodBits as Mark[] | undefined) ?? [];

  test.beforeAll(async () => {
    publisher = await startFakePublisher();
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'MarkGame', 1, 4);
    await saveSettings({ publisherBaseUrl: publisher.url, publisherToken: publisher.token });
    await waitForClips(ctx.page, 1);
  });

  test.afterAll(async () => {
    await ctx?.close();
    await publisher?.close();
  });

  test('the upload carries them, in the order they happen', async () => {
    const clip = await firstClip();

    // Marked out of order on purpose: the embed page numbers its
    // "Highlight 2" fallback off the list it is given.
    await call('POST', `/clips/${clip.id}/goodbits`, { startSec: 2.5, endSec: 3.25 });
    await call('POST', `/clips/${clip.id}/goodbits`, {
      startSec: 0.5,
      endSec: 1.5,
      name: 'First kill',
    });

    const published = await call('POST', `/clips/${clip.id}/publish`, { compress: false });
    expect(published.status).toBe(200);

    expect(publisher.uploads).toHaveLength(1);
    const sent = JSON.parse(publisher.uploads[0].goodBits ?? '[]') as Mark[];

    expect(sent).toEqual([
      { startSec: 0.5, endSec: 1.5, name: 'First kill', reason: null },
      { startSec: 2.5, endSec: 3.25, name: null, reason: null },
    ]);
  });

  test('marking one afterwards updates the sidecar, not the video', async () => {
    const clip = await firstClip();
    expect(clip.published).toBe(true);
    const before = publisher.uploads.length;

    await call('POST', `/clips/${clip.id}/goodbits`, {
      startSec: 3.4,
      endSec: 3.8,
      name: 'Clutch',
    });

    // The route answers before it pushes, so the assertion has to wait for the
    // request rather than for the response it already had.
    await expect.poll(() => lastPatched().length).toBe(3);
    expect(lastPatched().at(-1)).toEqual({
      startSec: 3.4,
      endSec: 3.8,
      name: 'Clutch',
      reason: null,
    });

    // A few hundred megabytes of video is exactly what this endpoint exists to
    // avoid re-sending.
    expect(publisher.uploads).toHaveLength(before);
  });

  test('removing the last one says so, rather than saying nothing', async () => {
    const clip = await firstClip();
    const listed = (await call('GET', `/clips/${clip.id}/goodbits`)).body as {
      items: Array<{ id: number }>;
    };

    for (const mark of listed.items) {
      await call('DELETE', `/clips/${clip.id}/goodbits/${mark.id}`);
    }

    /*
     * An empty list, and not an absent one. The publisher keeps what it has
     * when a request says nothing about marks, which is how an app older than
     * this feature renames a clip without wiping its bands: so the one case
     * that has to travel is every mark being gone.
     */
    await expect.poll(() => lastPatched().length).toBe(0);
    expect(publisher.patches.at(-1)?.body.goodBits).toEqual([]);
  });
});
