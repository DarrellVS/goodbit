/**
 * Turning the program in front into the name of a game.
 *
 * The top level folder name *is* the game name, so this decides what the
 * library looks like. Getting it wrong twice for the same game is the failure
 * that matters: `Battlefield 6` and `Battlefield™ 6` are two rows in the
 * library for one game, and nothing afterwards merges them.
 *
 * So the order below is not preference, it is damage control. A folder that
 * already exists always wins, then the sources that know a real name, then the
 * ones that are guessing.
 *
 * 1. **A folder already under the videos root.** Never start a second folder
 *    for a game that already has one.
 * 2. **A name already in the library**, passed in by the caller from the games
 *    table, for a game whose folder has since been emptied.
 * 3. **Steam**, matched by the longest install folder that is a parent of the
 *    executable. Pointed at the folder rather than the executable because a
 *    game ships nine of them and renames one every patch.
 * 4. **Epic**, from its own manifests, the same way.
 * 5. **The executable's version resource**, which is how
 *    `Headliners-Win64-Shipping.exe` becomes something a person would say.
 * 6. **The folder the executable sits in**, which is usually the game.
 *
 * A user override beats all of it, because a wrong guess should be correctable
 * once rather than argued with.
 */
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { installedSteamGames, type SteamGame } from '../obs/steam.js';

const run = promisify(execFile);

/** Characters Windows will not take in a folder name. */
const NAME_PROHIBITED = /[/\\:"<>*?|%]/g;

/**
 * A folder name Windows will allow.
 *
 * Removed rather than substituted. `DOOM - The Dark Ages` invents punctuation
 * the game does not have, and `DOOM_ The Dark Ages` looks like a bug;
 * `DOOM The Dark Ages` reads like a person wrote it.
 *
 * Moved here from `smartReplays.ts`, which this replaces.
 */
export function safeName(name: string): string {
  return name.replace(NAME_PROHIBITED, '').replace(/\s+/g, ' ').trim();
}

/** Compared with the punctuation and casing taken out, so one game is one folder. */
function flatten(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * A store's name, reconciled with the library that already exists.
 *
 * Steam stores the marketing name, trademark symbols and all, so it offers
 * `Battlefield™ 6` for a library whose folder has been `Battlefield 6` since
 * August. Moved here from `ApplyObsSetupAction.ts`, where it served the same
 * purpose for the script's alias list.
 */
export function reconcileName(storeName: string, existing: string[]): string {
  const cleaned = safeName(storeName.replace(/[™®©]/g, ''));
  const match = existing.find((name) => flatten(name) === flatten(cleaned));
  return match ?? cleaned;
}

/** The game folders already in the library. */
export function libraryFolders(videosRoot: string): string[] {
  try {
    return readdirSync(videosRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

interface InstalledGame {
  name: string;
  folder: string;
  source: 'steam' | 'epic';
}

let installed: InstalledGame[] | null = null;

/** Epic keeps one JSON manifest per installed game, and both fields we want are in it. */
function epicGames(): InstalledGame[] {
  const dir = path.join(
    process.env.PROGRAMDATA ?? 'C:\\ProgramData',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'Manifests',
  );

  try {
    return readdirSync(dir)
      .filter((entry) => entry.toLowerCase().endsWith('.item'))
      .flatMap((entry) => {
        try {
          const manifest = JSON.parse(readFileSync(path.join(dir, entry), 'utf-8')) as {
            DisplayName?: string;
            InstallLocation?: string;
          };
          if (!manifest.DisplayName || !manifest.InstallLocation) return [];
          return [
            { name: manifest.DisplayName, folder: manifest.InstallLocation, source: 'epic' as const },
          ];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

/**
 * Every game this machine has, from every store that will say.
 *
 * Cached for the life of the process, like `windowsDisplays()`. A game
 * installed mid-session is named by the version resource instead, which is
 * usually right anyway, and the next launch picks up the manifest.
 */
export async function installedGames(): Promise<InstalledGame[]> {
  if (installed) return installed;

  let steam: SteamGame[] = [];
  try {
    steam = await installedSteamGames();
  } catch {
    // No Steam, or a machine that will not answer.
  }

  installed = [
    ...steam.map((game) => ({ name: game.name, folder: game.folder, source: 'steam' as const })),
    ...epicGames(),
  ];
  return installed;
}

/** Is this executable a game we know about? Used to filter the foreground vote. */
export async function isKnownGame(exePath: string): Promise<boolean> {
  return (await matchInstalled(exePath)) !== null;
}

function within(folder: string, exePath: string): boolean {
  const parent = path.resolve(folder).toLowerCase();
  const child = path.resolve(exePath).toLowerCase();
  return child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

async function matchInstalled(exePath: string): Promise<InstalledGame | null> {
  if (!exePath) return null;

  // Longest folder wins, so a game inside another game's folder is not
  // swallowed by its parent.
  const games = (await installedGames())
    .filter((game) => within(game.folder, exePath))
    .sort((a, b) => b.folder.length - a.folder.length);

  return games[0] ?? null;
}

const versionNames = new Map<string, string>();

/**
 * The name the developer put in the executable.
 *
 * This is the step that turns `Headliners-Win64-Shipping.exe` into something
 * readable, and it covers every game that is not on Steam or Epic. One
 * PowerShell call, cached per executable, and never on the path of anything
 * the user is waiting for.
 */
async function versionName(exePath: string): Promise<string> {
  const key = exePath.toLowerCase();
  const known = versionNames.get(key);
  if (known !== undefined) return known;

  let name = '';
  try {
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$i = (Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo; ` +
          'if ($i.ProductName) { $i.ProductName } elseif ($i.FileDescription) { $i.FileDescription }',
      ],
      { windowsHide: true, timeout: 10_000, maxBuffer: 256 * 1024 },
    );
    name = safeName(stdout.trim().replace(/[™®©]/g, ''));
  } catch {
    // An executable that will not answer is named after its folder instead.
  }

  versionNames.set(key, name);
  return name;
}

export interface GameGuess {
  name: string;
  source: 'override' | 'folder' | 'steam' | 'epic' | 'version' | 'parent' | 'none';
}

export const UNSORTED = 'Unsorted';

/**
 * The name to file a clip under.
 *
 * `existing` is every name the library already knows, folders and game rows
 * both, so nothing here can invent a second spelling of a game that is already
 * there.
 */
export async function gameForExecutable(
  exePath: string,
  existing: string[],
  overrides: Record<string, string> = {},
): Promise<GameGuess> {
  if (!exePath) return { name: UNSORTED, source: 'none' };

  const override = overrides[exePath.toLowerCase()];
  if (override) return { name: safeName(override), source: 'override' };

  const match = await matchInstalled(exePath);
  if (match) return { name: reconcileName(match.name, existing), source: match.source };

  /*
   * A folder this executable already has wins over a better name for it.
   *
   * The library on this machine holds `Headliners-Win64-Shipping`, because
   * that is what the old script called it. The version resource would call it
   * `Headliners`, which is better, and writing it would leave two folders for
   * one game with the clips split between them. Renaming the old folder is a
   * deliberate tidy-up the user asks for, not something to do underneath them
   * on the next clip.
   */
  const ownNames = [
    path.basename(exePath, path.extname(exePath)),
    ...path.dirname(exePath).split(path.sep).filter(Boolean).slice(-2),
  ];
  const alreadyFiled = existing.find((folder) =>
    ownNames.some((name) => flatten(name) === flatten(folder)),
  );
  if (alreadyFiled) return { name: alreadyFiled, source: 'folder' };

  const fromVersion = await versionName(exePath);
  if (fromVersion) return { name: reconcileName(fromVersion, existing), source: 'version' };

  // The folder the executable sits in, unless that is a build directory, in
  // which case the one above it is the game. `Binaries/Win64/game.exe` is an
  // Unreal convention and it is everywhere.
  const parts = path.dirname(exePath).split(path.sep).filter(Boolean);
  const skip = new Set(['binaries', 'win64', 'win32', 'x64', 'bin', 'retail', 'game']);
  while (parts.length > 1 && skip.has(parts[parts.length - 1]!.toLowerCase())) parts.pop();

  const parent = safeName(parts[parts.length - 1] ?? '');
  return parent
    ? { name: reconcileName(parent, existing), source: 'parent' }
    : { name: UNSORTED, source: 'none' };
}
