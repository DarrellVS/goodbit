import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where this machine's clips actually are.
 *
 * Eight benches each carried `%USERPROFILE%/Videos` as the library root,
 * written when that was where the recordings lived. `videosRoot` is a setting
 * and it moves: on the machine this was built against it is `D:\Clips`, so
 * every one of them was reading a folder with no games in it and reporting
 * nothing found, which looks exactly like a detector that stopped working.
 *
 * The same order the app uses, so a bench and the app cannot disagree about
 * which library they are talking about:
 *
 * 1. `--source <folder>`, for pointing a bench at a copy.
 * 2. `GOODBIT_VIDEOS_ROOT`, which is how a throw-away library is driven.
 * 3. `videosRoot` from `settings.json`, under `GOODBIT_USER_DATA` when that is
 *    set, so a bench run beside a test profile reads that profile's library.
 * 4. `~/Videos`, which is the app's own first-run default.
 *
 * Read-only. Nothing here writes to a library, and a bench that does should
 * say so at the top of its own file.
 */
export function libraryRoot({ argv = process.argv, flag = '--source' } = {}) {
  const at = argv.indexOf(flag);
  if (at !== -1 && argv[at + 1]) return argv[at + 1];

  if (process.env.GOODBIT_VIDEOS_ROOT) return process.env.GOODBIT_VIDEOS_ROOT;

  const fromSettings = settingsVideosRoot();
  if (fromSettings) return fromSettings;

  return join(process.env.USERPROFILE || homedir(), 'Videos');
}

/** The data directory the app would use, honouring the test override. */
export function userDataDir() {
  if (process.env.GOODBIT_USER_DATA) return process.env.GOODBIT_USER_DATA;

  const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'GoodBit');
}

function settingsVideosRoot() {
  const path = join(userDataDir(), 'settings.json');
  if (!existsSync(path)) return null;

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    return typeof parsed.videosRoot === 'string' && parsed.videosRoot ? parsed.videosRoot : null;
  } catch {
    // A settings file being unreadable is not this bench's problem to report.
    return null;
  }
}

/**
 * Say which library a bench is about to read, before it reads it.
 *
 * The failure this whole file exists to prevent is silent: a bench pointed at
 * the wrong folder prints "0 clips" and reads as a broken detector. One line
 * of output makes it obvious instead.
 */
export function announceRoot(root, label = 'library') {
  const exists = existsSync(root);
  console.log(`${label}: ${root}${exists ? '' : '  (does not exist)'}`);
  return exists;
}
