/**
 * Steam already downloaded the box art. GoodBit can just read it.
 *
 * A library of folder names is a filing cabinet. The same library with each
 * game's own artwork on it is a shelf, and the difference costs nothing here,
 * because Steam has already fetched and cached all of it: on this machine,
 * 1011 games, 349 MB, written by Steam whenever a game's library page renders.
 * No key, no account, no network, and nothing that anybody can turn off.
 *
 * **Two layouts are live at once, so glob by filename.** Most files sit
 * directly in `librarycache\<appid>\`, and some sit one level deeper in a
 * forty character hex folder, for example
 * `librarycache\730\162664aa…\header.jpg`. That hash is Valve's own content
 * hash for the asset, the same one its CDN uses, so it changes whenever Valve
 * re-cuts an image. **It must never be stored.** Resolve the path each time,
 * and treat a miss as ordinary rather than as an error.
 *
 * **Two names for the same picture.** `header.jpg` and `library_header.jpg`
 * never appear together, and neither do `library_600x900.jpg` and
 * `library_capsule.jpg`. They are the same asset under two names, so each kind
 * below lists its aliases in preference order.
 *
 * **This art is for the app's own windows.** It is Valve's and the
 * publisher's, cached on this machine for this machine. Displaying it locally
 * is not the same act as serving it, so it must never be copied into
 * `publisher/` or attached to a public link.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { steamRootPath } from '../obs/steam.js';

/** What a game's page can ask for. */
export type ArtKind = 'header' | 'hero' | 'portrait' | 'logo' | 'icon';

/**
 * The file names each kind can be found under, best first.
 *
 * Verified against a real cache, with the share of games that carry each:
 * header 94.4% once both names are counted, hero 65.9%, portrait about 67%,
 * logo 63.5%, icon 74.5%.
 */
const NAMES: Record<ArtKind, string[]> = {
  header: ['header.jpg', 'library_header.jpg'],
  hero: ['library_hero.jpg'],
  portrait: ['library_600x900.jpg', 'library_capsule.jpg'],
  logo: ['logo.png'],
  // The icon is named after its own hash, so it is the one kind matched by
  // shape rather than by name.
  icon: [],
};

const ICON = /^[0-9a-f]{40}\.(jpg|png)$/i;

function cacheDir(root: string): string {
  return path.join(root, 'appcache', 'librarycache');
}

/** Everything in an appid's folder, including one level of hash subfolder. */
function filesFor(root: string, appId: string): string[] {
  const base = path.join(cacheDir(root), appId);
  if (!existsSync(base)) return [];

  const found: string[] = [];

  try {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const full = path.join(base, entry.name);
      if (entry.isFile()) {
        found.push(full);
        continue;
      }

      // One level, and only one: the hash folders hold files, not more
      // folders, and walking deeper would be inventing a layout.
      if (entry.isDirectory()) {
        try {
          for (const inner of readdirSync(full, { withFileTypes: true })) {
            if (inner.isFile()) found.push(path.join(full, inner.name));
          }
        } catch {
          // A folder that cannot be read is a folder with no art in it.
        }
      }
    }
  } catch {
    return [];
  }

  return found;
}

/**
 * The file for one kind of art, or null.
 *
 * Null is the normal answer for plenty of games: Steam only caches a library
 * page it has actually drawn, so a game somebody owns and has never looked at
 * has nothing here. Callers fall back to the folder name, which is what the
 * app showed before any of this existed.
 */
export async function artworkFile(appId: string, kind: ArtKind): Promise<string | null> {
  // Anything but digits is not an appid, and this string ends up in a file
  // path and, elsewhere, in a `steam://` URL.
  if (!/^\d+$/.test(appId)) return null;

  const root = await steamRootPath();
  if (!root) return null;

  const files = filesFor(root, appId);
  if (files.length === 0) return null;

  if (kind === 'icon') {
    const icon = files.find((file) => ICON.test(path.basename(file)));
    return icon ?? null;
  }

  for (const name of NAMES[kind]) {
    const match = files.find((file) => path.basename(file).toLowerCase() === name);
    // A zero byte file is Steam having started a download and not finished it.
    if (match && sizeOf(match) > 0) return match;
  }

  return null;
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

/** Which kinds this game actually has, so a caller can choose a layout. */
export async function artworkFor(appId: string): Promise<Partial<Record<ArtKind, string>>> {
  const found: Partial<Record<ArtKind, string>> = {};
  for (const kind of Object.keys(NAMES) as ArtKind[]) {
    const file = await artworkFile(appId, kind);
    if (file) found[kind] = file;
  }
  return found;
}

/** Is there a Steam cache on this machine at all? For the settings screen. */
export async function steamArtworkAvailable(): Promise<boolean> {
  const root = await steamRootPath();
  return root !== null && existsSync(cacheDir(root));
}
