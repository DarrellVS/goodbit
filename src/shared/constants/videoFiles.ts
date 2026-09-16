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
 * Glob patterns for a library laid out as a game folder per game.
 *
 * Built from the list rather than written out, so the scan cannot fall behind
 * the watcher again. fast-glob matches case sensitively on Windows unless told
 * otherwise, and `caseSensitiveMatch: false` covers the casing instead of the
 * four hand-written variants it replaces.
 */
export function videoGlobPatterns(depth = 1): string[] {
  const prefix = '*/'.repeat(depth);
  return VIDEO_EXTENSIONS.map((extension) => `${prefix}*${extension}`);
}

/** Extensions without the dot, for an Electron file dialog filter. */
export const VIDEO_DIALOG_EXTENSIONS = VIDEO_EXTENSIONS.map((extension) => extension.slice(1));
