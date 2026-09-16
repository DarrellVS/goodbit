import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import multer from 'multer';
import ffprobeStatic from 'ffprobe-static';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Two different questions, and they have different answers.
 *
 * A trim replaces the only copy of that moment, so it keeps the recorded
 * picture unless asked otherwise. What goes to a public link is a copy, so it
 * is shrunk by default and the file on disk is never touched. Both are checked
 * against what actually lands: the bytes on disk, and the bytes a publisher
 * receives.
 */

interface Probe {
  codec: string;
  durationSec: number;
}

function probe(filePath: string): Probe {
  const out = execFileSync(
    (ffprobeStatic as unknown as { path: string }).path,
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name:format=duration',
      '-of', 'json',
      filePath,
    ],
    { encoding: 'utf-8' },
  );
  const parsed = JSON.parse(out) as {
    streams: Array<{ codec_name: string }>;
    format: { duration: string };
  };
  return { codec: parsed.streams[0]?.codec_name ?? '', durationSec: Number(parsed.format.duration) };
}

const sha = (filePath: string) => createHash('sha1').update(readFileSync(filePath)).digest('hex');

/**
 * The publisher, as far as the app can tell: `POST /api/publish` takes a
 * multipart upload named `file` and answers with a filename and a URL, and
 * `PUT /api/publish/:filename/thumbnail` takes the poster frame for the embed
 * page. What it received is kept so the test can look at it.
 */
interface FakePublisher {
  server: Server;
  url: string;
  dir: string;
  received: Array<{ filename: string; sizeBytes: number; path: string; displayName?: string }>;
  /** The poster frames, which the real publisher no longer makes for itself. */
  posters: Array<{ filename: string; bytes: Buffer }>;
  /** What it will accept as a publish token, the way the real one does. */
  token: string;
  close: () => Promise<void>;
}

async function startFakePublisher(): Promise<FakePublisher> {
  const dir = mkdtempSync(join(tmpdir(), 'goodbit-fake-publisher-'));
  const received: FakePublisher['received'] = [];
  const posters: FakePublisher['posters'] = [];
  const app = express();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => cb(null, file.originalname),
    }),
  });
  const TOKEN = 'a-test-publish-token';

  // The real publisher refuses every write without this, so the fake one does
  // too: otherwise the test would pass whether or not the app sent it.
  const gate: express.RequestHandler = (req, res, next) => {
    const given = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '')?.[1];
    if (given !== TOKEN) {
      res.status(401).json({ message: 'Wrong or missing publish token.' });
      return;
    }
    next();
  };
  app.post('/api/publish', gate);

  app.post('/api/publish', upload.single('file'), (req, res) => {
    const file = req.file!;
    received.push({
      filename: file.originalname,
      sizeBytes: file.size,
      path: file.path,
      displayName: (req.body as { displayName?: string }).displayName,
    });
    res.json({ filename: file.originalname, url: `http://publisher.test/media/${file.originalname}` });
  });
  /*
   * The poster, which the publisher used to cut for itself with an ffmpeg in
   * its container and now receives. Raw JPEG bytes, and behind the same token
   * as everything else that writes.
   */
  /*
   * The parameter type is spelled out because Express 5 types `req.params`
   * values as `string | string[]`: path-to-regexp 8 can repeat a parameter, so
   * the general case is a list. `:filename` here is one segment and cannot be.
   */
  app.put<{ filename: string }>(
    '/api/publish/:filename/thumbnail',
    gate,
    express.raw({ type: 'image/jpeg', limit: '8mb' }),
    (req, res) => {
      posters.push({ filename: req.params.filename, bytes: req.body as Buffer });
      res.json({ stored: true });
    },
  );
  app.delete('/api/publish/:filename', (_req, res) => res.json({ removed: true }));

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    dir,
    received,
    posters,
    token: TOKEN,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test.describe('compressing what gets shared', () => {
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

  type Listed = { id: number; filePath: string; filename: string; published: boolean; sizeBytes: number };
  const clips = async (): Promise<Listed[]> =>
    ((await call('GET', '/clips', undefined, { pageSize: 50, game: 'ShareGame' })).body as { items: Listed[] })
      .items.sort((a, b) => a.filename.localeCompare(b.filename));

  test.beforeAll(async () => {
    publisher = await startFakePublisher();
    ctx = await launchApp();
    // Four seconds each, fat: long enough for a one second cut to sit inside
    // a GOP, and with enough bytes that compressing is visible on a synthetic
    // pattern at all.
    seedClips(ctx.videosRoot, 'ShareGame', 4, 4, 6);
    await saveSettings({ publisherBaseUrl: publisher.url, publisherToken: publisher.token });
    await ctx.page.waitForTimeout(9000);
  });

  test.afterAll(async () => {
    await ctx?.close();
    await publisher?.close();
  });

  test('a trim lands on the frames asked for, not the nearest keyframe', async () => {
    const clip = (await clips())[0];

    const res = await call('POST', `/clips/${clip.id}/trim`, { startSec: 1.25, endSec: 2.25 });
    const body = res.body as {
      mode: string;
      actualStartSec: number;
      actualEndSec: number;
      sizeBytes: number;
    };
    expect(res.status).toBe(200);

    /*
     * The default used to be a stream copy, which cannot begin in the middle of
     * a group of pictures. This fixture has one keyframe, at zero, so asking
     * for 1.25 to 2.25 produced a file that started at zero and ran half again
     * as long as the range on screen, and the app reported megabytes rather
     * than the range, so nobody could see it happen.
     */
    expect(body.mode).toBe('exact');
    expect(body.actualStartSec).toBeCloseTo(1.25, 2);
    expect(body.actualEndSec).toBeCloseTo(2.25, 2);
    expect(body.sizeBytes).toBeGreaterThan(0);
  });

  test('turning the setting on re-encodes the cut, exactly where asked', async () => {
    await saveSettings({ compressTrims: true });
    try {
      const clip = (await clips())[1];
      const before = statSync(clip.filePath).size;

      const res = await call('POST', `/clips/${clip.id}/trim`, { startSec: 1.25, endSec: 2.25 });
      const body = res.body as {
        mode: string;
        actualStartSec: number;
        actualEndSec: number;
        sizeBytes: number;
      };
      expect(res.status).toBe(200);
      expect(body.mode).toBe('compressed');
      // A re-encode does not snap to a keyframe: the cut is the cut.
      expect(body.actualStartSec).toBeCloseTo(1.25, 2);
      expect(body.actualEndSec).toBeCloseTo(2.25, 2);

      const after = probe(clip.filePath);
      expect(after.codec).toBe('h264');
      expect(after.durationSec).toBeGreaterThan(0.9);
      expect(after.durationSec).toBeLessThan(1.15);
      expect(body.sizeBytes).toBe(statSync(clip.filePath).size);
      expect(body.sizeBytes).toBeLessThan(before);
    } finally {
      await saveSettings({ compressTrims: false });
    }
  });

  test('publishing sends a smaller copy and leaves the original alone', async () => {
    const clip = (await clips())[2];
    const originalHash = sha(clip.filePath);
    const originalSize = statSync(clip.filePath).size;

    // Nothing passed: the compress-published setting decides, and it is on.
    const res = await call('POST', `/clips/${clip.id}/publish`, {});
    expect(res.status).toBe(200);
    expect((res.body as { published: boolean }).published).toBe(true);

    const upload = publisher.received.find((r) => r.filename === clip.filename);
    expect(upload, 'the copy must carry the clip\'s own filename, or it can never be unpublished').toBeTruthy();
    expect(upload!.sizeBytes).toBeLessThan(originalSize);
    expect(probe(upload!.path).codec).toBe('h264');

    /*
     * And the poster went with it. The publisher has no ffmpeg any more, so if
     * the app does not send this the embed page has no picture at all: the
     * upload succeeding is not the whole of publishing working.
     *
     * The clip's own name, because that is what the poster is stored under at
     * the other end, and a real JPEG rather than an empty body.
     */
    const poster = publisher.posters.find((p) => p.filename === clip.filename);
    expect(poster, 'the embed page has no picture unless the app sends one').toBeTruthy();
    expect(poster!.bytes.length).toBeGreaterThan(0);
    expect([poster!.bytes[0], poster!.bytes[1]]).toEqual([0xff, 0xd8]);
    // What the test seeded is byte-for-byte what is still there.
    expect(sha(clip.filePath)).toBe(originalHash);
    // The size the library shows is the file's, not the copy's.
    const listed = (await clips()).find((c) => c.id === clip.id)!;
    expect(listed.sizeBytes).toBe(originalSize);
  });

  test('a clip that is already published is not offered a compressed copy', async () => {
    const clip = (await clips())[2];
    expect(clip.published).toBe(true);
    const countBefore = publisher.received.length;

    const res = await call('POST', `/clips/${clip.id}/publish`, { compress: true });
    expect(res.status).toBe(409);
    expect(publisher.received.length).toBe(countBefore);
  });

  test('a publish carries the token, and says so plainly when it is wrong', async () => {
    await saveSettings({ publisherToken: 'not-the-right-one' });
    try {
      const clip = (await clips())[1];
      const res = await call('POST', `/clips/${clip.id}/publish`, {});
      expect(res.status).toBeGreaterThanOrEqual(400);

      // What the server said, not "Request failed with status code 401": the
      // person reading it is the one who has to go and fix the token.
      const body = res.body as { error?: string; message?: string };
      expect(JSON.stringify(body)).toMatch(/publish token/i);

      const listed = (await clips()).find((c) => c.id === clip.id)!;
      expect(listed.published, 'a refused upload must not be recorded as published').toBe(false);
    } finally {
      await saveSettings({ publisherToken: publisher.token });
    }
  });

  test('asking for the original uploads the recording byte for byte', async () => {
    const clip = (await clips())[3];
    const res = await call('POST', `/clips/${clip.id}/publish`, { compress: false });
    expect(res.status).toBe(200);

    const upload = publisher.received.find((r) => r.filename === clip.filename);
    expect(upload).toBeTruthy();
    expect(upload!.sizeBytes).toBe(statSync(clip.filePath).size);
    expect(sha(upload!.path)).toBe(sha(clip.filePath));
  });

  test('the setting can be turned off, and then a plain publish sends the original', async () => {
    await saveSettings({ compressPublished: false });
    try {
      const clip = (await clips())[0];
      const res = await call('POST', `/clips/${clip.id}/publish`, {});
      expect(res.status).toBe(200);

      const upload = publisher.received.filter((r) => r.filename === clip.filename).pop();
      expect(upload).toBeTruthy();
      expect(sha(upload!.path)).toBe(sha(clip.filePath));
    } finally {
      await saveSettings({ compressPublished: true });
    }
  });
});
