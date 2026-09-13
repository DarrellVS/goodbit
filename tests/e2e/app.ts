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
 * test launches beside the tray app instead of being turned away by it — and
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
  const { configured = true, legacyDatabase, dataDir: existing } = options;

  const base = existing ? dirname(existing) : mkdtempSync(join(tmpdir(), 'goodbit-test-'));
  const dataDir = existing ?? join(base, 'data');
  const videosRoot = join(base, 'videos');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(videosRoot, { recursive: true });

  if (legacyDatabase && existsSync(legacyDatabase)) {
    copyFileSync(legacyDatabase, join(videosRoot, 'filmpje.db'));
  }

  // Reusing a profile means keeping whatever it already stored — that is the
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
   * packaged .exe — the artifact people actually install, where asar packing
   * and native module loading can fail in ways the dev build never does.
   */
  const packaged = process.env.GOODBIT_TEST_BINARY;

  const app = await electron.launch({
    ...(packaged
      ? { executablePath: packaged, args: [] }
      : { args: ['out/main/index.js'] }),
    cwd: process.cwd(),
    env: { ...process.env, GOODBIT_USER_DATA: dataDir },
  });

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

/** A handful of tiny real clips, made with the bundled ffmpeg. */
export function seedClips(
  videosRoot: string,
  game: string,
  count = 2,
  /** Seconds. Long enough matters for timeline tests: the lane has a 1000px
   * floor, so short clips never reach its right edge. */
  duration = 2,
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
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', '-y', file,
    ]);
    made.push(file);
  }
  return made;
}
