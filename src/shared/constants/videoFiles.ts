/**
 * Which files are clips, in one place.
 *
 * This was six separate answers to one question and they did not agree. The
 * watcher, the staging folder, the `goodbit://` protocol, the share MIME map,
 * the file dialog and the OBS setup's own comment all said mp4, mov and mkv.
 * The library scan globbed only mp4 and mov, in both casings, so an mkv was
 * watched, filed into the right game folder, served and playable, and then
 * removed from the library by the next reconciliation sweep, which could not
 * see it on disk and took the row for missing.
 *
 * Nothing logged it. `setup.ts` pins `RecFormat2=mp4` for a profile GoodBit
 * writes, so a machine set up by the app never hit it; a machine whose OBS was
 * configured by hand did.
 *
 * Adding a container here is not enough on its own: `ffprobe` has to read it
 * and `<video>` has to play it, or the clip indexes and then shows a black
 * tile. avi, mkv and webm arriving by *import* are transcoded on the way in,
 * see `ImportFilesAction`, which is a different question from what the library
 * watches.
 */

/** The containers the library indexes, watches and serves. Lower case. */
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv'] as const;

export type VideoExtension = (typeof VIDEO_EXTENSIONS)[number];

/**
 * The same list as a test, case insensitive.
 *
 * OBS writes lower case and a file dragged in from somewhere else may not be,
 * which is why the scan was carrying `*.MP4` and `*.MOV` patterns by hand.
 */
export const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|mkv)$/i;

/** Whether a path is a clip, by its name alone. */
export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSION_PATTERN.test(filePath);
}

/**
 * The folder a timeline export lands in, inside its game's own folder.
 *
 * Here rather than in the export action because it is the one name that nests:
 * the glob below has to allow it and the export has to write it, and two
 * spellings of it is a file that is written and never indexed.
 */
export const EXPORTS_FOLDER = 'Exports';

/**
 * Where a clip is allowed to sit, relative to the videos root.
 *
 * A top level folder name *is* a game name in this app, so the library is one
 * level deep by definition: `<Game>/clip.mp4`. Exactly one thing nests, and it
 * is allow-listed rather than allowed by depth: `<Game>/Exports/clip.mp4`.
 *
 * **Not a general depth of 2.** That would index every folder anybody has ever
 * made inside a game folder, and the first ones it would find are somebody's
 * own `Renders` or `Old` directory, whose contents would be adopted as clips
 * of that game and then be swept, thumbnailed and shown. An allow list is the
 * narrow version of the same change.
 */
const CLIP_DIRECTORIES = ['*', `*/${EXPORTS_FOLDER}`] as const;

/**
 * Glob patterns for a library laid out as a game folder per game.
 *
 * Built from the list rather than written out, so the scan cannot fall behind
 * the watcher again. fast-glob matches case sensitively on Windows unless told
 * otherwise, and `caseSensitiveMatch: false` covers the casing instead of the
 * four hand-written variants it replaces.
 *
 * `depth` overrides the layout entirely and exists for a caller that wants a
 * flat answer at one level; the default is the layout above.
 */
export function videoGlobPatterns(depth?: number): string[] {
  const directories =
    depth === undefined ? [...CLIP_DIRECTORIES] : ['*/'.repeat(depth).slice(0, -1) || '.'];

  return directories.flatMap((directory) =>
    VIDEO_EXTENSIONS.map((extension) => `${directory}/*${extension}`),
  );
}

/**
 * Whether the scan would index a path, asked of the layout rather than of a
 * separator count.
 *
 * The watcher and the scan disagreed about this and nothing held them
 * together: chokidar runs one level deeper than the scan globs, so it
 * announced files the scan would never create a row for. Both read this now.
 *
 * `rel` is relative to the videos root, in either separator.
 */
export function isClipLayout(rel: string): boolean {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.length < 2 || !isVideoFile(parts[parts.length - 1])) return false;
  // A dot folder is the staging area or a cache, and is never a clip's home.
  if (parts.some((part) => part.startsWith('.'))) return false;

  if (parts.length === 2) return true;
  if (parts.length === 3) return parts[1].toLowerCase() === EXPORTS_FOLDER.toLowerCase();
  return false;
}

/** Whether a path sits in a game's own exports folder. */
export function isExportPath(rel: string): boolean {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  return parts.length === 3 && parts[1].toLowerCase() === EXPORTS_FOLDER.toLowerCase();
}

/** Extensions without the dot, for an Electron file dialog filter. */
export const VIDEO_DIALOG_EXTENSIONS = VIDEO_EXTENSIONS.map((extension) => extension.slice(1));
