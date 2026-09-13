import path from 'node:path';
import fs from 'node:fs/promises';
import { AUDIO_ROOT } from '../data-source.js';
import { ffmpegConfigured } from './ffmpeg.js';

/**
 * Music the editor can lay under a timeline lives in one flat folder. There is
 * no database table for it — the files are the whole model — so the filename
 * doubles as the id and every lookup is a stat.
 */
export const EDITOR_AUDIO_DIR = path.join(AUDIO_ROOT, 'Editor');

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
  await fs.mkdir(EDITOR_AUDIO_DIR, { recursive: true });
}

/**
 * Resolve a track id to a path inside the music folder, or null.
 *
 * The id arrives from the client, so it is stripped to a bare filename and the
 * result is checked to still sit inside the folder — `..` must not escape.
 */
export function resolveAudioPath(id: string): string | null {
  const filename = path.basename(id);
  if (!filename || filename === '.' || filename === '..') return null;
  if (!isAudioFile(filename)) return null;

  const resolved = path.resolve(EDITOR_AUDIO_DIR, filename);
  if (path.relative(EDITOR_AUDIO_DIR, resolved).includes('..')) return null;
  return resolved;
}

export async function probeDurationSec(filePath: string, cacheKey: string): Promise<number> {
  const cached = durationCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const duration = await new Promise<number>((resolve) => {
    ffmpegConfigured.ffprobe(filePath, (err, data) => {
      if (err) return resolve(0);
      resolve(Number(data?.format?.duration) || 0);
    });
  });

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

  while (await exists(path.join(EDITOR_AUDIO_DIR, filename))) {
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
