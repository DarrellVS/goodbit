import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { VIDEOS_ROOT } from '../data-source.js';

/**
 * Where the derived files live: thumbnails, frame strips, analysis.
 *
 * One folder beside the game folders rather than three, and hidden, because
 * this sits in someone's Videos folder next to their recordings.
 */
export const CACHE_DIR_NAME = '.goodbit-cache';

/** What the folder was called while the app was still called Filmpje. */
const LEGACY_CACHE_DIR_NAME = '.filmpje-cache';

/** `<videos>/.goodbit-cache/<kind>`, created if it is not there yet. */
export function cacheDir(kind: 'thumbnails' | 'frames' | 'analysis'): string {
  const dir = path.join(VIDEOS_ROOT, CACHE_DIR_NAME, kind);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The same path without creating anything, for deletes and for globs to skip. */
export function cacheDirPath(kind: 'thumbnails' | 'frames' | 'analysis'): string {
  return path.join(VIDEOS_ROOT, CACHE_DIR_NAME, kind);
}

/**
 * Carry the old folder over, once.
 *
 * The app was renamed; its cache should not be regenerated over that. A rename
 * is instant and keeps hundreds of thumbnails that are still perfectly good,
 * and if it fails, the only cost is that they get made again.
 */
export function migrateLegacyCacheDir(): void {
  if (!VIDEOS_ROOT) return;

  const legacy = path.join(VIDEOS_ROOT, LEGACY_CACHE_DIR_NAME);
  const current = path.join(VIDEOS_ROOT, CACHE_DIR_NAME);

  if (!existsSync(legacy) || existsSync(current)) return;

  try {
    renameSync(legacy, current);
    console.log(`[cache] ${LEGACY_CACHE_DIR_NAME} is now ${CACHE_DIR_NAME}`);
  } catch (error) {
    console.error('[cache] could not carry the old cache folder over:', error);
  }
}
