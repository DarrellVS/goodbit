import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { expect } from '@playwright/test';

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
  /**
   * Extra keys for the profile's `settings.json`.
   *
   * For the settings main reads before a window exists, and which therefore
   * cannot be set through the UI mid-test: the MCP server's port and token are
   * the case this was added for, since it only listens when it boots and finds
   * them.
   */
  settings?: Record<string, unknown>;
  /** Seed remembered window bounds. */
  window?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    maximized: boolean;
  };
}


/**
 * Where a test window opens, when there is somewhere better than in your face.
 *
 * The suite launches the app 118 times, and every one of those windows used to
 * appear on the primary display, over whatever was already there. On a machine
 * with a second monitor there is an obvious better answer, so the first launch
 * of a run asks Electron what displays exist and remembers the first
 * non-primary one. Every launch after that seeds the remembered bounds into
 * the profile before starting, so the window opens there rather than appearing
 * on the primary and jumping.
 *
 * Null means one display, which is also what CI looks like, and then nothing
 * is seeded and the behaviour is exactly as it was. `GOODBIT_TEST_PRIMARY=1`
 * forces that same path on a machine that does have a second screen.
 */
type WindowOrigin = { x: number; y: number };
let offPrimary: WindowOrigin | null | undefined;

async function rememberOffPrimaryDisplay(app: ElectronApplication): Promise<void> {
  if (offPrimary !== undefined) return;

  offPrimary = await app.evaluate(({ screen }) => {
    const primary = screen.getPrimaryDisplay();
    const other = screen.getAllDisplays().find((display) => display.id !== primary.id);
    if (!other) return null;
    return { x: other.workArea.x + 40, y: other.workArea.y + 40 };
  });
}

export async function launchApp(options: LaunchOptions = {}): Promise<TestApp> {
  const {
    configured = true,
    legacyDatabase,
    dataDir: existing,
    env = {},
    settings = {},
  } = options;

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
        ...(options.window
          ? { window: options.window }
          : offPrimary
            ? { window: { ...offPrimary, width: 1400, height: 900, maximized: false } }
            : {}),
        ...settings,
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

  /*
   * Silent and out of the way, always.
   *
   * `--mute-audio` mutes every renderer, which covers video previews, the
   * players and the chimes the overlay card synthesises: a test run made
   * noise on the machine it ran on. `GOODBIT_TEST_INVISIBLE` makes the
   * windows transparent, taskbar-less and focus-less while still painting
   * them (see `src/main/testMode.ts`), and the occlusion switch stops Chromium
   * deciding a transparent window is hidden and pausing it.
   * `GOODBIT_TEST_VISIBLE=1` shows them again, for watching a run.
   */
  const quiet = ['--mute-audio', '--disable-features=CalculateNativeWinOcclusion'];
  const app = await electron.launch({
    ...(packaged
      ? { executablePath: packaged, args: quiet }
      : { args: ['out/main/index.js', ...quiet] }),
    cwd: process.cwd(),
    env: {
      ...process.env,
      GOODBIT_USER_DATA: dataDir,
      ...(process.env.GOODBIT_TEST_VISIBLE ? {} : { GOODBIT_TEST_INVISIBLE: '1' }),
      ...env,
    },
  });

  /*
   * Ask once per run, and move this first window by hand.
   *
   * The answer needs a running Electron, so the very first launch of a run has
   * already opened somewhere before it can be known. That one gets moved after
   * the fact; every launch after it is seeded before it starts and opens in
   * the right place to begin with.
   */
  if (process.env.GOODBIT_TEST_PRIMARY) {
    offPrimary = null;
  } else {
    const firstOfRun = offPrimary === undefined;
    await rememberOffPrimaryDisplay(app);
    if (firstOfRun && offPrimary && !options.window) {
      const target = offPrimary;
      await app.evaluate(({ BrowserWindow }, origin) => {
        for (const win of BrowserWindow.getAllWindows()) {
          // The notch places itself on purpose and is left alone.
          const url = win.webContents.getURL();
          if (url.startsWith('data:') || url.includes('notch.html')) continue;
          const bounds = win.getBounds();
          win.setBounds({ ...bounds, x: origin.x, y: origin.y });
        }
      }, target);
    }
  }

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

  const page = await mainWindow(app);
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
 * The app's own window, rather than whichever one Electron opened first.
 *
 * `firstWindow()` was right while there was only ever one. The clip toast is a
 * second `BrowserWindow`, built during boot so the first replay of a session
 * does not wait for a window to be constructed, and it is quite capable of
 * winning that race: ten tests across six specs failed at once, each of them
 * driving a transparent 344 pixel overlay that has no app in it.
 *
 * Told apart by URL. The overlay is a self contained `data:` page with no
 * bundle behind it; the app is a file or a dev server. Nothing else in either
 * process needs to know the difference, which is why the fix belongs here.
 */
async function mainWindow(app: ElectronApplication): Promise<Page> {
  // The notch is a page of the renderer bundle too, so it is told apart by name.
  const isApp = (candidate: Page): boolean =>
    !candidate.url().startsWith('data:') && !candidate.url().includes('notch.html');

  const existing = app.windows().find(isApp);
  if (existing) return existing;

  for (;;) {
    const opened = await app.waitForEvent('window', { timeout: 30_000 });
    if (isApp(opened)) return opened;
  }
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

/**
 * Wait until the page has stopped changing, instead of sleeping.
 *
 * The suite used to follow every navigation and every press with a fixed
 * `waitForTimeout`, 113 of them and over six minutes in total, each one a
 * guess at how long a render takes on this machine: too long almost every
 * time, and too short on a slow one. This resolves once the DOM has been
 * quiet for `quietMs` (it mutates while a route loads its data and draws),
 * after two animation frames, and gives up waiting at `maxMs` rather than
 * failing, because a page with a clock on it is never quiet.
 *
 * Motion is off under the suite (`src/main/testMode.ts`), so there is no
 * transition left to wait out after this.
 */
export async function settle(page: Page, quietMs = 150, maxMs = 3000): Promise<void> {
  await page.evaluate(
    ({ quietMs, maxMs }) =>
      new Promise<void>((resolve) => {
        const frames = (): Promise<void> =>
          new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
        // Quiet means no DOM change *and* no API request still out: a route
        // that has not had its data yet can be perfectly still.
        const busy = (): boolean => (window.goodbit?.apiInFlight?.() ?? 0) > 0;
        void frames().then(() => {
          let timer = window.setTimeout(finish, quietMs);
          const deadline = performance.now() + maxMs;
          const cap = window.setTimeout(() => {
            observer.disconnect();
            window.clearTimeout(timer);
            void frames().then(resolve);
          }, maxMs);
          const observer = new MutationObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(finish, quietMs);
          });
          observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
          function finish(): void {
            if (busy() && performance.now() < deadline) {
              timer = window.setTimeout(finish, 50);
              return;
            }
            observer.disconnect();
            window.clearTimeout(timer);
            window.clearTimeout(cap);
            void frames().then(resolve);
          }
        });
      }),
    { quietMs, maxMs },
  );
}

/** Go to a route by hash, and wait for it to settle. */
export async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await settle(page);
}

/**
 * Wait until the library has indexed at least `count` clips, then show them.
 *
 * Seeding happens after launch, so the clips arrive through the watcher, which
 * waits for a file to stop growing before it believes it. The suite used to
 * sleep nine or ten seconds here; this asks the app instead and moves on the
 * moment the rows are there.
 */
export async function waitForClips(
  page: Page,
  count: number,
  options: { reload?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const { reload = true, timeoutMs = 30_000 } = options;
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const answer = await window.goodbit!.apiRequest({
            method: 'GET',
            path: '/clips',
            query: { pageSize: 1, includeHidden: 'true' },
          });
          return (answer.body as { total?: number }).total ?? 0;
        }),
      { timeout: timeoutMs, intervals: [200] },
    )
    .toBeGreaterThanOrEqual(count);
  // The rows exist; the screen learns of them through a live update that
  // arrives when it arrives. Reloading makes it read them now, which is what
  // a test that seeded clips before looking at anything wants. A test about
  // the live update itself passes `reload: false`.
  if (reload) await page.reload();
  await settle(page);
}

/** Wait for every video on the page to know its own size. */
export async function videosReady(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    // Only the players that load. A card's preview is `preload="none"` until
    // somebody points at it, and would never report a size.
    () =>
      [...document.querySelectorAll('video')]
        .filter((video) => video.preload !== 'none')
        .every((video) => video.readyState >= 1),
    undefined,
    { timeout: timeoutMs },
  );
  await settle(page);
}

/** One painted frame: enough for a hover or a focus to have been drawn, with motion off. */
export async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}
