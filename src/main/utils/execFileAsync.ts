import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * `execFile`, awaited.
 *
 * The same three lines, the import, the promisify and the binding, existed in
 * four files. Nothing was wrong with any of them and nothing here changes what
 * they do: `promisify(execFile)` returns the same function whichever module
 * calls it, so this is one binding instead of four identical ones.
 *
 * Note this is for reading a program's output, ffprobe and ffmpeg's own
 * `-list` style queries. Long ffmpeg work does not come through here: it goes
 * through `services/mediaQueue.ts`, which caps how many run at once, and
 * `services/ffmpegProcess.ts`.
 */
export const execFileAsync = promisify(execFile);
