import path from 'node:path';
import fs from 'node:fs/promises';
import { AUDIO_ROOT } from '../data-source.js';
import { ffprobeJson } from './ffmpegProcess.js';

/**
 * Music the editor can lay under a timeline lives in one flat folder. There is
 * no database table for it. The files are the whole model, so the filename
 * doubles as the id and every lookup is a stat.
 */
/**
 * Resolved on every call, never at import.
 *
 * This was `const EDITOR_AUDIO_DIR = path.join(AUDIO_ROOT, 'Editor')`, which
 * runs the moment the module is imported. `AUDIO_ROOT` is a live binding
 * assigned by `refreshRoots()` during boot, so at import time it is still the
 * empty string, and `path.join('', 'Editor')` is not an absolute path at all:
 * it is the relative `Editor`.
 *
 * So every track anybody added went to `<working directory>/Editor`. For a
 * packaged app that is wherever it was started from; running from source it is
 * the repository, which is how two mp3 files somebody uploaded ended up
 * committed.
 *
 * The live binding is the whole point of `AUDIO_ROOT` being a `let`, and
 * `path.join` takes a copy of whatever it is handed. A function reads the
 * binding when the answer is actually wanted, which is also what makes
 * changing the music folder in Settings take effect without a restart.
 */
export function editorAudioDir(): string {
  return path.join(AUDIO_ROOT, 'Editor');
}

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'];

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
};

/** Probing spawns ffprobe, so results are cached until the file changes. */
const durationCache = new Map<string, number>();

export function audioMimeType(extension: string): string {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? 'application/octet-stream';
}

export function isAudioFile(filename: string): boolean {
  return AUDIO_EXTENSIONS.includes(path.extname(filename).toLowerCase());
}

export async function ensureAudioDir(): Promise<void> {
  await fs.mkdir(editorAudioDir(), { recursive: true });
}

/**
 * Resolve a track id to a path inside the music folder, or null.
 *
 * The id arrives from the client, so it is stripped to a bare filename and the
 * result is checked to still sit inside the folder, `..` must not escape.
 */
export function resolveAudioPath(id: string): string | null {
  const filename = path.basename(id);
  if (!filename || filename === '.' || filename === '..') return null;
  if (!isAudioFile(filename)) return null;

  const resolved = path.resolve(editorAudioDir(), filename);
  if (path.relative(editorAudioDir(), resolved).includes('..')) return null;
  return resolved;
}

export async function probeDurationSec(filePath: string, cacheKey: string): Promise<number> {
  const cached = durationCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const duration = await ffprobeJson(filePath)
    .then((data) => Number(data.format?.duration) || 0)
    .catch(() => 0);

  durationCache.set(cacheKey, duration);
  return duration;
}

/** Pick a filename that does not collide with what is already in the folder. */
export async function uniqueAudioFilename(originalName: string): Promise<string> {
  const extension = path.extname(originalName).toLowerCase();
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[<>:"/\|?*\x00-\x1f]/g, '_')
    .trim() || 'track';

  let filename = `${base}${extension}`;
  let counter = 1;

  while (await exists(path.join(editorAudioDir(), filename))) {
    filename = `${base}_${counter}${extension}`;
    counter++;
  }

  return filename;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
