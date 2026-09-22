import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { expect, test } from '@playwright/test';
import { launchApp, seedClips, type TestApp } from './app';

/**
 * Numbers, rather than opinions, about three things that were open in 2.0.
 *
 * The plan that asked for them gated decisions on measurements that did not
 * exist: how long a whole-library scan takes, which says whether incremental
 * indexing is worth building; how long a real export takes, which says how big
 * the export rework is; and whether an mkv survives the round trip now that
 * one list decides what a clip is. The plan is gone and the measurements are
 * still the answer, so they stay.
 *
 * Kept as a spec rather than a script because all three need the real app: the
 * scan is an action behind the internal API, the export is a job with a poll
 * loop, and playback is a question about the Chromium that ships in this
 * Electron. One build and one launch answers all of them, which is the point.
 *
 * **This is a bench, not a gate.** It asserts only that each thing happened at
 * all, and prints the numbers. Run it on purpose:
 *
 *   npx playwright test tests/e2e/measure.spec.ts --reporter=line
 *
 * Set `GOODBIT_REAL_CLIPS` to a folder of real recordings to make the export
 * measurement realistic. Without it the export runs on synthetic 640x360
 * clips, which is a floor rather than a forecast, and it says so.
 */

/** Big enough to be worth complaining about, and about the size of a real library. */
const LIBRARY_SIZE = 280;

/** Real recordings to measure against. Copied out, never touched in place. */
const REAL_CLIPS = process.env.GOODBIT_REAL_CLIPS;

const ffmpeg = ffmpegPath as unknown as string;

interface ClipRow {
  id: number;
  filename: string;
  durationSec: number | null;
}

interface ClipPage {
  items: ClipRow[];
  total: number;
}

interface JobView {
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  error: string | null;
}

test.describe('measurements for 2.0', () => {
  let ctx: TestApp;

  // The export of three real ultrawide recordings is minutes, not seconds.
  test.setTimeout(20 * 60 * 1000);

  /**
   * The internal API, unwrapped.
   *
   * `apiRequest` answers with the whole response, `{ status, body, headers }`,
   * because it is dispatching an Express router in-process. Every caller wants
   * the body.
   */
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

  const clipsIn = (game: string): Promise<ClipPage> =>
    call<ClipPage>('GET', '/clips', undefined, { game, pageSize: '200' });

  test.beforeAll(async () => {
    ctx = await launchApp();
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a matroska file survives the round trip', async () => {
    // The defect this proves fixed: six places said mp4, mov and mkv, and the
    // scan globbed only mp4 and mov, so an mkv was watched, filed, served and
    // playable, and then removed by the next sweep along with its row. The row
    // is the only copy of that clip's tags, notes and stars.
    const game = 'Matroska';
    const [source] = seedClips(ctx.videosRoot, game, 1, 3);

    // A real Matroska file, by rewrapping. Renaming an mp4 does not make one,
    // and ffprobe would refuse it, which would prove the wrong thing.
    const remuxed = join(ctx.videosRoot, game, 'remuxed.mkv');
    execFileSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', source!, '-c', 'copy', remuxed]);
    copyFileSync(remuxed, join(ctx.videosRoot, game, 'shouty.MKV'));
    copyFileSync(source!, join(ctx.videosRoot, game, 'MiXeD.Mp4'));

    await call('POST', '/scan');

    const { items } = await clipsIn(game);
    const byName = new Map(items.map((clip) => [clip.filename, clip]));
    console.log(`indexed in ${game}: ${[...byName.keys()].sort().join(', ')}`);

    expect(byName.has('remuxed.mkv')).toBe(true);
    expect(byName.has('shouty.MKV')).toBe(true);
    // Mixed casing, which the four hand-written glob patterns also missed:
    // they only covered a name that was upper case throughout.
    expect(byName.has('MiXeD.Mp4')).toBe(true);

    // Indexed is not enough. A row with no duration is a tile with no length
    // on it, and the length is the first thing anyone wants from a clip.
    expect(byName.get('remuxed.mkv')?.durationSec ?? 0).toBeGreaterThan(0);

    // A second sweep is where the row used to disappear.
    await call('POST', '/scan');
    const after = await clipsIn(game);
    expect(after.items.map((clip) => clip.filename).sort()).toEqual(
      items.map((clip) => clip.filename).sort(),
    );

    /*
     * And then the part that decides whether indexing an mkv is a kindness or
     * a trap. Chromium ships no Matroska demuxer in most builds, so a clip can
     * index, thumbnail and serve and still refuse to play, which looks exactly
     * like a broken recording. Recorded either way rather than asserted,
     * because the answer belongs in the plan and not in a red test.
     */
    const mkvId = byName.get('remuxed.mkv')!.id;
    const playable = await ctx.page.evaluate(async (clipId: number) => {
      const video = document.createElement('video');
      video.muted = true;
      video.src = `goodbit://media/clip/${clipId}`;

      return await new Promise<{ ok: boolean; detail: string }>((resolve) => {
        const done = (ok: boolean, detail: string): void => resolve({ ok, detail });
        video.addEventListener('loadedmetadata', () =>
          done(
            true,
            `duration ${video.duration.toFixed(2)}s, ${video.videoWidth}x${video.videoHeight}`,
          ),
        );
        video.addEventListener('error', () =>
          done(false, video.error ? `code ${video.error.code}: ${video.error.message}` : 'unknown'),
        );
        setTimeout(() => done(false, 'timed out after 8s'), 8000);
      });
    }, mkvId);

    console.log(
      `MEASURED  mkv playback in this Chromium: ${playable.ok ? 'yes' : 'no'} (${playable.detail})`,
    );
  });

  test('how long a whole-library scan takes', async () => {
    // What 4.2 is about: every clip that arrives triggers a scan of the whole
    // library, and the library grows every session. The warm pass is the one
    // that matters, because the cold one also probes each new file for its
    // duration and only ever happens once per clip.
    const game = 'ScanBench';
    seedClips(ctx.videosRoot, game, LIBRARY_SIZE, 1);

    const cold = await timed(() => call('POST', '/scan'));
    const warm = await timed(() => call('POST', '/scan'));
    const again = await timed(() => call('POST', '/scan'));

    const { total } = await call<ClipPage>('GET', '/clips', undefined, { pageSize: '1' });
    const best = Math.min(warm, again);

    console.log(
      `MEASURED  scan of ${total} clips: ${cold} ms cold (probing every new file), ` +
        `${warm} ms then ${again} ms warm`,
    );
    console.log(`MEASURED  warm scan: ${(best / total).toFixed(2)} ms per clip, ${best} ms total`);

    expect(total).toBeGreaterThanOrEqual(LIBRARY_SIZE);
  });

  test('how long a real export takes', async () => {
    const game = 'ExportBench';
    let real = false;

    if (REAL_CLIPS && existsSync(REAL_CLIPS)) {
      const dir = join(ctx.videosRoot, game);
      mkdirSync(dir, { recursive: true });
      const picked = readdirSync(REAL_CLIPS)
        .filter((name) => /\.(mp4|mov|mkv)$/i.test(name))
        .slice(0, 3);

      for (const name of picked) {
        // Copied in. The folder handed over is only ever read.
        copyFileSync(join(REAL_CLIPS, name), join(dir, name));
      }
      real = picked.length > 0;
      console.log(`export input: ${picked.length} real recordings copied from ${REAL_CLIPS}`);
    }

    if (!real) {
      seedClips(ctx.videosRoot, game, 3, 10);
      console.log('export input: synthetic 640x360 clips, a floor rather than a forecast');
    }

    await call('POST', '/scan');
    const { items } = await clipsIn(game);
    expect(items.length).toBeGreaterThan(0);

    const timeline = items.map((clip, index) => ({
      clipId: clip.id,
      startTime: index * 5,
      trimStart: 0,
      trimEnd: Math.min(5, clip.durationSec ?? 5),
      volume: 1,
      muted: false,
    }));
    const seconds = timeline.reduce((sum, item) => sum + (item.trimEnd - item.trimStart), 0);

    const { exportId } = await call<{ exportId: string }>('POST', '/clips/export', {
      clips: timeline,
      outputName: 'measure-bench',
      format: 'original',
    });

    const started = Date.now();
    const finished = await pollUntilDone();
    const elapsed = Date.now() - started;

    async function pollUntilDone(): Promise<JobView> {
      for (;;) {
        const job = await call<JobView>('GET', `/clips/export/${exportId}/status`);
        if (job.status === 'done') return job;
        if (job.status === 'error') throw new Error(job.error ?? 'export failed');
        if (job.status === 'cancelled') throw new Error('export cancelled');
        await ctx.page.waitForTimeout(500);
      }
    }

    console.log(
      `MEASURED  export of ${timeline.length} clips (${real ? 'real recordings' : 'synthetic'}), ` +
        `${seconds.toFixed(1)}s of output: ${elapsed} ms, ` +
        `${(elapsed / 1000 / seconds).toFixed(2)}s per second of output`,
    );
    console.log(`MEASURED  export finished as: ${finished.message || 'no message'}`);

    // The render lands in the library as a clip of its own. Every clip on this
    // timeline is from one game, so it belongs to that game, in its own
    // `Exports/` folder, rather than to the flat top level one.
    const exports = await clipsIn(game);
    expect(exports.items.some((clip) => clip.filename.startsWith('measure-bench'))).toBe(true);
  });
});

/** Milliseconds, for something that has to finish. */
async function timed(work: () => Promise<unknown>): Promise<number> {
  const started = Date.now();
  await work();
  return Date.now() - started;
}
