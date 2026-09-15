import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

/**
 * Launching GoodBit for a test, with a library it cannot damage.
 *
 * Every run gets its own data directory, its own videos root and its own
 * database. `GOODBIT_USER_DATA` carries the single-instance lock with it, so a
 * test launches beside the tray app instead of being turned away by it, and
 * more importantly, never opens the real library.
 */

export interface TestApp {
  app: ElectronApplication;
  page: Page;
  /** The throw-away videos root this run is pointed at. */
  videosRoot: string;
  dataDir: string;
  close: () => Promise<void>;
}

export interface LaunchOptions {
  /** Seed the profile with a videos folder. Off for first-run tests. */
  configured?: boolean;
  /** Copy a database in as though the web app had left one behind. */
  legacyDatabase?: string;
  /** Reuse an existing profile, to test what survives a restart. */
  dataDir?: string;
  /**
   * Extra environment for the app process.
   *
   * `GOODBIT_OBS_DIR` is the one that matters: it points the OBS reader and
   * writer at a directory of fixtures, so a test never touches the OBS the
   * machine running it happens to have.
   */
  env?: Record<string, string>;
  /** Seed remembered window bounds. */
  window?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    maximized: boolean;
  };
}

export async function launchApp(options: LaunchOptions = {}): Promise<TestApp> {
  const { configured = true, legacyDatabase, dataDir: existing, env = {} } = options;

  const base = existing ? dirname(existing) : mkdtempSync(join(tmpdir(), 'goodbit-test-'));
  const dataDir = existing ?? join(base, 'data');
  const videosRoot = join(base, 'videos');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(videosRoot, { recursive: true });

  if (legacyDatabase && existsSync(legacyDatabase)) {
    copyFileSync(legacyDatabase, join(videosRoot, 'filmpje.db'));
  }

  // Reusing a profile means keeping whatever it already stored, that is the
  // point of relaunching into it.
  if (configured && !existing) {
    writeFileSync(
      join(dataDir, 'settings.json'),
      JSON.stringify({
        videosRoot,
        audioRoot: join(base, 'music'),
        publisherBaseUrl: '',
        // Never register a login item from a test.
        startAtLogin: false,
        keepRunningInTray: false,
        migratedFromWebApp: false,
        ...(options.window ? { window: options.window } : {}),
      }),
    );
    mkdirSync(join(base, 'music'), { recursive: true });
  }

  /**
   * Normally the dev build, but GOODBIT_TEST_BINARY points the same suite at a
   * packaged .exe. The artifact people actually install, where asar packing
   * and native module loading can fail in ways the dev build never does.
   */
  const packaged = process.env.GOODBIT_TEST_BINARY;

  const app = await electron.launch({
    ...(packaged
      ? { executablePath: packaged, args: [] }
      : { args: ['out/main/index.js'] }),
    cwd: process.cwd(),
    env: { ...process.env, GOODBIT_USER_DATA: dataDir, ...env },
  });

  /*
   * The main process's own log, when asked for.
   *
   * A failing test can only see what the window renders, and most of what goes
   * wrong in this app goes wrong in main: a scan that threw, a watcher that
   * never started, a boot step that failed. Without this the only way to find
   * out is to rebuild the scenario by hand outside Playwright, which is slow
   * and gets the conditions subtly wrong.
   *
   *   GOODBIT_TEST_LOG=1 npx playwright test tests/e2e/trim.spec.ts
   */
  if (process.env.GOODBIT_TEST_LOG) {
    const node = app.process();
    node.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[main] ${chunk}`));
    node.stderr?.on('data', (chunk: Buffer) => process.stdout.write(`[main!] ${chunk}`));
  }

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    videosRoot,
    dataDir,
    close: async () => {
      await app.close();
      // A caller that supplied its own dataDir owns the cleanup; removing it
      // here would delete the profile a relaunch is about to read.
      if (!existing) rmSync(base, { recursive: true, force: true });
    },
  };
}

/**
 * One tiny real clip, at exactly the path asked for.
 *
 * `seedClips` puts clips where the library expects them. This one is for the
 * paths the library does not expect, such as the staging folder a replay
 * arrives in before GoodBit has decided which game it belongs to.
 */
export function makeVideo(filePath: string, duration = 2): void {
  mkdirSync(dirname(filePath), { recursive: true });
  execFileSync(ffmpegPath as unknown as string, [
    '-hide_banner', '-v', 'error',
    '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', filePath,
  ]);
}

/** A handful of tiny real clips, made with the bundled ffmpeg. */
export function seedClips(
  videosRoot: string,
  game: string,
  count = 2,
  /** Seconds. Long enough matters for timeline tests: the lane has a 1000px
   * floor, so short clips never reach its right edge. */
  duration = 2,
  /**
   * x264 crf. Lower is fatter; a test about compression seeds something with
   * bytes to lose, since a synthetic pattern at the default is already tiny.
   */
  crf = 23,
): string[] {
  const ffmpeg = ffmpegPath as unknown as string;

  const dir = join(videosRoot, game);
  mkdirSync(dir, { recursive: true });

  const made: string[] = [];
  for (let i = 0; i < count; i++) {
    const file = join(dir, `${game}_clip_${i}.mp4`);
    execFileSync(ffmpeg, [
      '-hide_banner', '-v', 'error',
      '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=${duration}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', '-y', file,
    ]);
    made.push(file);
  }
  return made;
}

/**
 * A clip with an obvious loud moment in the middle of it.
 *
 * `seedClips` makes a constant tone, which is exactly the case the analysis is
 * built to refuse. Nothing to point at. This one has somewhere to point.
 */
export function seedSpikyClip(
  videosRoot: string,
  game: string,
  name = 'spike',
  duration = 26,
  loudFrom = 12,
  loudTo = 16,
): string {
  const ffmpeg = ffmpegPath as unknown as string;
  const dir = join(videosRoot, game);
  mkdirSync(dir, { recursive: true });

  const file = join(dir, `${name}.mp4`);
  execFileSync(ffmpeg, [
    '-hide_banner', '-v', 'error',
    '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
    // Quiet throughout, then forty times louder for four seconds.
    '-af', `volume=0.02,volume=enable='between(t,${loudFrom},${loudTo})':volume=40`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', file,
  ]);

  return file;
}

/**
 * A clip with nothing in it: a still picture and music that swells and fades.
 *
 * This is the shape the analysis used to be fooled by. It has plenty of dynamic
 * range. The swell is tens of LU, but nothing stands out from the rest of the
 * clip, which is exactly what a menu screen or a loading screen looks like to
 * an ear.
 */
export function seedSwellClip(videosRoot: string, game: string, name = 'menu', duration = 26): string {
  const ffmpeg = ffmpegPath as unknown as string;
  const dir = join(videosRoot, game);
  mkdirSync(dir, { recursive: true });

  const file = join(dir, `${name}.mp4`);
  execFileSync(ffmpeg, [
    '-hide_banner', '-v', 'error',
    '-f', 'lavfi', '-t', String(duration), '-i', 'color=c=0x101820:size=640x360:rate=30',
    '-f', 'lavfi', '-t', String(duration), '-i', 'sine=frequency=180',
    '-f', 'lavfi', '-t', String(duration), '-i', 'sine=frequency=270',
    '-f', 'lavfi', '-t', String(duration), '-i', 'sine=frequency=410',
    // Three tones under one slow rise and fall. The range this produces is
    // around 11 LU, well past the flatness floor, so the only thing that can
    // refuse it is the test that nothing stands out.
    '-filter_complex',
    '[1:a][2:a][3:a]amix=inputs=3,volume=0.3,' +
      `volume=eval=frame:volume=0.12+0.85*abs(sin(PI*t/${Math.round(duration / 3)}))[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', file,
  ]);

  return file;
}
