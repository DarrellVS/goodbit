import { describe, expect, it } from 'vitest';
import {
  isVideoFile,
  VIDEO_DIALOG_EXTENSIONS,
  VIDEO_EXTENSIONS,
  videoGlobPatterns,
  isClipLayout,
  isExportPath,
  EXPORTS_FOLDER,
} from '../../../src/shared/constants/videoFiles.js';

/**
 * Which files are clips.
 *
 * Six places used to answer this and one of them disagreed: the library scan
 * globbed mp4 and mov while everything else also took mkv, so an mkv was
 * watched, filed, served and playable, and then deleted from the library by the
 * next reconciliation sweep, which could not see it and took the row for
 * missing. A row is the only copy of a clip's tags, notes and stars.
 *
 * The test that matters here is the last one: the scan's patterns have to cover
 * every extension the watcher accepts. Adding a container to the list without
 * it is how this happened the first time.
 */

describe('the list itself', () => {
  it('is lower case, dotted, and has no duplicates', () => {
    for (const extension of VIDEO_EXTENSIONS) {
      expect(extension).toBe(extension.toLowerCase());
      expect(extension.startsWith('.')).toBe(true);
    }

    expect(new Set(VIDEO_EXTENSIONS).size).toBe(VIDEO_EXTENSIONS.length);
  });

  it('drops the dot for an Electron dialog filter, which does not want one', () => {
    expect(VIDEO_DIALOG_EXTENSIONS).toEqual(['mp4', 'mov', 'mkv']);
  });
});

describe('recognising a clip by name', () => {
  it('takes every extension on the list, in any casing', () => {
    // OBS writes lower case. A file dragged in from a phone or another tool
    // may not be, and the scan used to carry `*.MP4` by hand for that reason.
    for (const extension of VIDEO_EXTENSIONS) {
      expect(isVideoFile(`D:\\Clips\\Game\\clip${extension}`)).toBe(true);
      expect(isVideoFile(`D:\\Clips\\Game\\clip${extension.toUpperCase()}`)).toBe(true);
    }
  });

  it('refuses what is not a clip', () => {
    expect(isVideoFile('D:\\Clips\\Game\\clip.txt')).toBe(false);
    expect(isVideoFile('D:\\Clips\\Game\\clip.mp3')).toBe(false);
    expect(isVideoFile('D:\\Clips\\Game\\thumbnail.jpg')).toBe(false);
    expect(isVideoFile('D:\\Clips\\Game')).toBe(false);
    expect(isVideoFile('')).toBe(false);
  });

  it('wants the extension at the end, not anywhere in the path', () => {
    // A cache folder called `.filmpje-cache/mp4` or a game named after a
    // container should not make every file inside it a clip.
    expect(isVideoFile('D:\\Clips\\mp4\\notes')).toBe(false);
    expect(isVideoFile('D:\\Clips\\Game\\clip.mp4.part')).toBe(false);
  });
});

describe('the patterns the scan walks', () => {
  it('looks one folder deep, because the game folder is the game name', () => {
    for (const pattern of videoGlobPatterns()) {
      expect(pattern.startsWith('*/')).toBe(true);
    }
  });

  it('agrees with the predicate the watcher asks', () => {
    /*
     * The bug this pair exists to stop.
     *
     * chokidar watches one level deeper than the scan globs, so it used to
     * announce `clip-added` for a file in a folder of somebody's own inside a
     * game folder and the scan that followed created nothing. A phantom the
     * library reacted to, with no row behind it, and a row that somehow did
     * exist would have been counted missing and deleted on the next sweep.
     */
    expect(isClipLayout('Battlefield 6/clip.mp4')).toBe(true);
    expect(isClipLayout('Battlefield 6\\clip.mp4')).toBe(true);
    expect(isClipLayout(`Battlefield 6/${EXPORTS_FOLDER}/montage.mp4`)).toBe(true);
    expect(isClipLayout('Battlefield 6/exports/montage.mp4')).toBe(true);

    // Somebody's own folder, which is the case that must stay out.
    expect(isClipLayout('Battlefield 6/Old/clip.mp4')).toBe(false);
    expect(isClipLayout(`Battlefield 6/${EXPORTS_FOLDER}/Old/clip.mp4`)).toBe(false);
    // A loose file at the root has no game.
    expect(isClipLayout('clip.mp4')).toBe(false);
    // Staging, where OBS writes a replay before GoodBit files it.
    expect(isClipLayout('.goodbit-incoming/clip.mp4')).toBe(false);
    expect(isClipLayout('Battlefield 6/.filmpje-cache/thumb.mp4')).toBe(false);
    expect(isClipLayout('Battlefield 6/notes.txt')).toBe(false);
  });

  it('knows an export from a recording by where it sits', () => {
    expect(isExportPath(`Battlefield 6/${EXPORTS_FOLDER}/montage.mp4`)).toBe(true);
    expect(isExportPath('Battlefield 6/clip.mp4')).toBe(false);
    // The old flat folder, which is a game called Exports rather than a game's
    // own exports, and stays exactly as it is.
    expect(isExportPath(`${EXPORTS_FOLDER}/montage.mp4`)).toBe(false);
  });

  it('covers every extension the watcher accepts', () => {
    // The regression, as an assertion. These two answers drifted apart once
    // and the app deleted rows over it.
    const patterns = videoGlobPatterns();

    for (const extension of VIDEO_EXTENSIONS) {
      expect(patterns.some((pattern) => pattern.endsWith(extension))).toBe(true);
    }

    // Two shapes now: the game folder itself and its exports folder.
    expect(patterns).toHaveLength(VIDEO_EXTENSIONS.length * 2);
  });

  it('allows exactly one nested folder, by name', () => {
    // A general depth of 2 would adopt the contents of somebody's own
    // `Renders` or `Old` folder as clips of that game. The allow list is the
    // narrow version of the same change.
    const patterns = videoGlobPatterns();

    for (const extension of VIDEO_EXTENSIONS) {
      expect(patterns).toContain(`*/${EXPORTS_FOLDER}/*${extension}`);
    }
    expect(patterns.some((pattern) => pattern.startsWith('*/*/'))).toBe(false);
  });

  it('can be asked for a deeper library', () => {
    expect(videoGlobPatterns(2).every((pattern) => pattern.startsWith('*/*/'))).toBe(true);
  });
});
