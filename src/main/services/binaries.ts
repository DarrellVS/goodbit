import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

/**
 * Where ffmpeg and ffprobe actually are.
 *
 * `ffmpeg-static` reports its path relative to where it was installed, which
 * inside a packaged app points into `app.asar`, an archive, not a directory,
 * so the executable cannot be spawned from it. electron-builder puts these in
 * `app.asar.unpacked` instead (see `asarUnpack` in electron-builder.yml), and
 * the path has to be redirected to match.
 *
 * This is invisible in development, where there is no archive: the packaged
 * build simply fails to make a thumbnail, trim or export. The e2e suite run
 * against the packaged binary is what catches it.
 */
function unpacked(path: string): string {
  if (!path) return path;

  // Only rewrite when the reported path really is inside the archive, and only
  // if the unpacked copy is actually there, a wrong guess would replace a
  // working path with a broken one.
  if (!path.includes('app.asar')) return path;

  const redirected = path.replace('app.asar', 'app.asar.unpacked');
  return existsSync(redirected) ? redirected : path;
}

export const FFMPEG_PATH = unpacked((ffmpegStatic as unknown as string) ?? 'ffmpeg');
export const FFPROBE_PATH = unpacked(ffprobeStatic?.path ?? 'ffprobe');
