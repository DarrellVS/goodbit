import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The games on this machine, so the folders are named before the first clip.
 *
 * An executable name is how a library ends up with a game called `project8` or
 * `bf6`, and correcting those by hand is one line per game. Nobody types
 * fifteen of those.
 *
 * Steam already knows the answer: every installed game has a manifest with its
 * real name and its folder. And the script matches a **parent directory** as
 * well as an exact executable, walking up from the running process, so an
 * alias on the install folder covers whatever the executable inside it turns
 * out to be called. That is the whole trick: no executable detection, no
 * guessing, and it keeps working when a game ships a new launcher.
 */

export interface SteamGame {
  name: string;
  /** The install folder, which is what the alias points at. */
  folder: string;
  appId: string;
}

let cachedRoot: string | null | undefined;

/**
 * Where Steam is, asked once.
 *
 * Reading the registry costs a process launch, and the answer does not change
 * while the app is running. Exported because the artwork cache lives under the
 * same root and there is no reason to find it twice.
 */
export async function steamRootPath(): Promise<string | null> {
  if (cachedRoot === undefined) cachedRoot = await steamRoot();
  return cachedRoot;
}

/** Where Steam is, from its own registry key. */
async function steamRoot(): Promise<string | null> {
  if (process.platform !== 'win32') return null;

  for (const [hive, key] of [
    ['HKCU', 'SOFTWARE\\Valve\\Steam'],
    ['HKLM', 'SOFTWARE\\WOW6432Node\\Valve\\Steam'],
  ] as const) {
    try {
      const { stdout } = await run('reg', ['query', `${hive}\\${key}`, '/v', hive === 'HKCU' ? 'SteamPath' : 'InstallPath']);
      const match = stdout.match(/REG_SZ\s+(.+)/);
      if (match) {
        const root = match[1].trim();
        if (existsSync(root)) return root;
      }
    } catch {
      // Not installed, or a key this user cannot read.
    }
  }

  return null;
}

/**
 * The library folders, out of Steam's own VDF.
 *
 * Not a VDF parser: the file is a nest of quoted pairs and the only thing
 * wanted from it is every `"path"` value, which a single expression finds
 * without pretending to understand the format.
 */
function libraryPaths(root: string): string[] {
  const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf');
  const paths = new Set<string>([root]);

  try {
    const text = readFileSync(vdf, 'utf-8');
    for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
      paths.add(match[1].replace(/\\\\/g, '\\'));
    }
  } catch {
    // One library then, the one Steam is installed in.
  }

  return [...paths].filter((candidate) => existsSync(path.join(candidate, 'steamapps')));
}

function manifestValue(text: string, key: string): string | null {
  const match = text.match(new RegExp(`"${key}"\\s+"([^"]*)"`));
  return match ? match[1] : null;
}

/** Everything Steam has installed here, with the folder each one lives in. */
export async function installedSteamGames(): Promise<SteamGame[]> {
  const root = await steamRoot();
  if (!root) return [];

  const games: SteamGame[] = [];

  for (const library of libraryPaths(root)) {
    const appsDir = path.join(library, 'steamapps');
    let entries: string[] = [];
    try {
      entries = readdirSync(appsDir).filter((name) => /^appmanifest_\d+\.acf$/.test(name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      try {
        const text = readFileSync(path.join(appsDir, entry), 'utf-8');
        const name = manifestValue(text, 'name');
        const installDir = manifestValue(text, 'installdir');
        const appId = manifestValue(text, 'appid') ?? entry.replace(/\D/g, '');
        if (!name || !installDir) continue;

        const folder = path.join(appsDir, 'common', installDir);
        if (!existsSync(folder)) continue;

        // Valve's own runtimes and redistributables are installed like games
        // and are not games. Nobody clips Proton.
        if (/^(Steamworks|Steam Linux Runtime|Proton)/i.test(name)) continue;

        games.push({ name, folder, appId });
      } catch {
        // A manifest mid-write, or one for a game on a drive that is not here.
      }
    }
  }

  return games.sort((a, b) => a.name.localeCompare(b.name));
}
