/**
 * Which Steam game a library folder is, when it is one at all.
 *
 * The folder name is the game name, and Steam knows both names and appids, so
 * most of this is matching two strings carefully. Measured against a real
 * library of 37 folders: 17 matched, and of the 20 that did not, 13 are
 * correctly unmatched because they are not games (`Discord`, `Spotify`,
 * `Cursor`, `GoPro-samples`). The genuine misses are all folders named after
 * an executable rather than a game, `cs2`, `BF2042`,
 * `Headliners-Win64-Shipping`, which is the library's own history showing
 * through and is what the override exists for.
 *
 * Two sources, cheapest first, and both entirely local:
 *
 * - **Installed games**, which the app already reads for naming. `steam.ts`
 *   has carried `appId` on `SteamGame` all along and dropped it one file
 *   later; this picks it back up.
 * - **`HKCU\Software\Valve\Steam\Apps\<appid>\Name`**, a flat registry list of
 *   every app this client has seen, so a game that has since been uninstalled
 *   still resolves and keeps its artwork.
 *
 * Deliberately not `appinfo.vdf`. It knows more games, but it is an undocumented
 * binary format that has already changed how it stores its keys, and a parser
 * for the previous version reads plausible garbage rather than failing. The two
 * sources here are text, and a miss costs a folder name rather than a wrong
 * game.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { installedSteamGames } from '../obs/steam.js';

const run = promisify(execFile);

/** Compared with punctuation, case and trademark symbols taken out. */
function flatten(value: string): string {
  return value
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

let registryGames: Map<string, string> | null = null;

/**
 * Every app this Steam client has ever seen, by flattened name.
 *
 * Read once. `reg query` on a key with a hundred subkeys is a process launch
 * and a hundred lines, and the answer does not change while the app runs.
 */
async function fromRegistry(): Promise<Map<string, string>> {
  if (registryGames) return registryGames;

  const found = new Map<string, string>();
  registryGames = found;
  if (process.platform !== 'win32') return found;

  try {
    const { stdout } = await run(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam\\Apps', '/s', '/v', 'Name'],
      { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
    );

    /*
     * `reg query /s` prints a key line, then its values, then a blank line.
     * The appid is the last segment of the key, and the name arrives a line or
     * two later, so the key is remembered until its name turns up.
     */
    let appId: string | null = null;
    for (const line of stdout.split(/\r?\n/)) {
      const key = line.match(/\\Apps\\(\d+)\s*$/);
      if (key) {
        appId = key[1];
        continue;
      }

      const name = line.match(/^\s+Name\s+REG_SZ\s+(.+?)\s*$/);
      if (name && appId) {
        const flat = flatten(name[1]);
        // First writer wins: the same name twice is a game and its demo or
        // its server, and the lower appid is the game.
        if (flat && !found.has(flat)) found.set(flat, appId);
        appId = null;
      }
    }
  } catch {
    // No Steam, or a key this user cannot read. A folder name is the fallback.
  }

  return found;
}

let installed: Map<string, string> | null = null;

async function fromManifests(): Promise<Map<string, string>> {
  if (installed) return installed;

  const found = new Map<string, string>();
  installed = found;

  try {
    for (const game of await installedSteamGames()) {
      // Both the game's name and its install folder: a folder named after the
      // directory on disk is exactly the case the manifests can answer.
      for (const candidate of [game.name, game.folder.split(/[\\/]/).pop() ?? '']) {
        const flat = flatten(candidate);
        if (flat && !found.has(flat)) found.set(flat, game.appId);
      }
    }
  } catch {
    // Steam not installed, or a library folder that will not read.
  }

  return found;
}

/**
 * The appid for a library folder, or null when it is not a Steam game.
 *
 * Null is an ordinary answer, not a failure: plenty of folders here are a
 * browser, a drone camera or a game from somewhere else entirely.
 */
export async function appIdForGame(game: string): Promise<string | null> {
  const flat = flatten(game);
  if (!flat) return null;

  const manifests = await fromManifests();
  const direct = manifests.get(flat);
  if (direct) return direct;

  const registry = await fromRegistry();
  return registry.get(flat) ?? null;
}

/** For a diagnostic, and for the bench. */
export async function knownSteamNames(): Promise<number> {
  return (await fromManifests()).size + (await fromRegistry()).size;
}
