import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
}

export async function launchApp(options: LaunchOptions = {}): Promise<TestApp> {
  const { configured = true, legacyDatabase } = options;

  const base = mkdtempSync(join(tmpdir(), 'goodbit-test-'));
  const dataDir = join(base, 'data');
  const videosRoot = join(base, 'videos');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(videosRoot, { recursive: true });

  if (legacyDatabase && existsSync(legacyDatabase)) {
    copyFileSync(legacyDatabase, join(videosRoot, 'filmpje.db'));
  }

  if (configured) {
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
      }),
    );
    mkdirSync(join(base, 'music'), { recursive: true });
  }

  const app = await electron.launch({
    args: ['out/main/index.js'],
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
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** A handful of tiny real clips, made with the bundled ffmpeg. */
export function seedClips(videosRoot: string, game: string, count = 2): string[] {
  const ffmpeg = ffmpegPath as unknown as string;

  const dir = join(videosRoot, game);
  mkdirSync(dir, { recursive: true });

  const made: string[] = [];
  for (let i = 0; i < count; i++) {
    const file = join(dir, `${game}_clip_${i}.mp4`);
    execFileSync(ffmpeg, [
      '-hide_banner', '-v', 'error',
      '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=2`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', '-y', file,
    ]);
    made.push(file);
  }
  return made;
}
