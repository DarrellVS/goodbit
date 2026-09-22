import { spawn } from 'node:child_process';
import { FFMPEG_PATH, FFPROBE_PATH } from './binaries.js';

/**
 * Spawning ffmpeg and ffprobe, without a wrapper in between.
 *
 * This replaces `fluent-ffmpeg`, which printed `Package no longer supported` on
 * every install and was carrying none of the parts of this app that took
 * measuring to get right: every hardware path here already builds its own
 * argument array by hand (`-hwaccel_output_format cuda`, where the tone map
 * sits in the chain, the stacked HUD sample boxes, the two-pass lossless trim).
 * What the wrapper was actually doing is process spawning, argument joining and
 * progress parsing, which is this file.
 *
 * Two things it did that are deliberately *not* reproduced, because both were
 * pure cost:
 *
 * - **It ran `ffmpeg -encoders` before every command**, to decide whether to
 *   add `-strict experimental`. `services/encoders.ts` already probes the
 *   machine once per process and caches the answer.
 * - **It ran a full `ffprobe` on the first input of every command**, whose
 *   result nothing here read. Two extra processes per thumbnail, and a library
 *   scrolls past hundreds of them.
 *
 * What *is* reproduced exactly is argument assembly, because the call sites
 * were written against it: options arrive as strings like `-t 4.500`, and a
 * string of exactly two space-separated parts becomes two arguments while
 * anything else is passed through whole. See `splitOption`.
 */

/** Sixteen thousand lines of ffmpeg log is plenty to diagnose a failure. */
const STDERR_LIMIT = 256 * 1024;

export interface RunOptions {
  /** Abort to kill the ffmpeg process. Without this a cancelled job keeps rendering. */
  signal?: AbortSignal;
  /** Fraction 0..1 of this command, from ffmpeg's own progress readout. */
  onProgress?: (fraction: number) => void;
  /** Seconds of output expected, used to turn ffmpeg's progress time into a fraction. */
  durationSec?: number;
  /** Hard ceiling so a wedged process cannot hang a job forever. */
  timeoutMs?: number;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * How an option string becomes arguments.
 *
 * Exactly the rule `fluent-ffmpeg` applied, kept because every call site in
 * main was written against it: `'-t 4.500'` is two arguments, `'-c:v copy'` is
 * two arguments, and `'-vf zscale=t=linear,tonemap=hable'` is two because it
 * has one space in it. A string with no space, or with two or more, is one
 * argument: that is what keeps a filter graph carrying a space (`-af`, a
 * `drawtext`) from being cut in half, and it is why a filter graph should be
 * handed to `complexFilter()` rather than pushed through `outputOptions` as a
 * pair.
 */
function splitOption(option: string): string[] {
  const parts = String(option).split(' ');
  return parts.length === 2 ? parts : [String(option)];
}

interface CommandInput {
  path: string;
  options: string[];
}

/**
 * One ffmpeg invocation, built up and then read back as an argument array.
 *
 * The shape mirrors what the call sites already say, so porting them was a
 * change of import rather than a rewrite. `args()` is the whole point: a
 * command can be asserted in a unit test, which was never true of a
 * `FfmpegCommand`.
 */
export class FfmpegCommand {
  private readonly inputs: CommandInput[] = [];
  private readonly complexFilters: string[] = [];
  private readonly videoOptions: string[] = [];
  private readonly options: string[] = [];
  private outputPath: string | null = null;

  constructor(inputPath?: string) {
    if (inputPath !== undefined) this.input(inputPath);
  }

  input(inputPath: string): this {
    this.inputs.push({ path: inputPath, options: [] });
    return this;
  }

  /** Options for the input most recently added, placed before its `-i`. */
  inputOptions(options: string[]): this {
    const current = this.inputs[this.inputs.length - 1];
    if (!current) throw new Error('inputOptions() before input()');
    for (const option of options) current.options.push(...splitOption(option));
    return this;
  }

  /** `-ss` on the input side, which seeks before decoding rather than after. */
  seekInput(seconds: number | string): this {
    const current = this.inputs[this.inputs.length - 1];
    if (!current) throw new Error('seekInput() before input()');
    current.options.push('-ss', String(seconds));
    return this;
  }

  /** Stop after this many video frames. */
  frames(count: number): this {
    this.videoOptions.push('-frames:v', String(count));
    return this;
  }

  /**
   * A `-filter_complex` graph, its stages joined with `;`.
   *
   * Always this rather than `outputOptions(['-filter_complex', graph])`: a
   * graph with exactly one space in it would be split in half by the rule
   * above, and a graph is exactly the kind of string that grows a space.
   */
  complexFilter(filters: string[]): this {
    this.complexFilters.push(...filters);
    return this;
  }

  outputOptions(options: string[]): this {
    for (const option of options) this.options.push(...splitOption(option));
    return this;
  }

  output(outputPath: string): this {
    this.outputPath = outputPath;
    return this;
  }

  /**
   * The command line, in the order ffmpeg wants it: per-input options, then
   * `-i`, then globals, then the filter graph, then output options and the
   * output path.
   */
  args(): string[] {
    if (!this.outputPath) throw new Error('ffmpeg command has no output');

    const args: string[] = [];
    for (const input of this.inputs) args.push(...input.options, '-i', input.path);

    // `-y` was added unconditionally for a file output by the wrapper, so
    // several call sites never passed it and would otherwise block forever on
    // a cache path that already exists.
    args.push('-y');

    if (this.complexFilters.length) args.push('-filter_complex', this.complexFilters.join(';'));

    args.push(...this.videoOptions, ...this.options, this.outputPath);
    return args;
  }
}

export function ffmpegCommand(inputPath?: string): FfmpegCommand {
  return new FfmpegCommand(inputPath);
}

/**
 * `HH:MM:SS.microseconds` as seconds, ffmpeg's own `out_time`.
 *
 * Returns null rather than 0 for anything unreadable, because ffmpeg emits
 * `out_time=-577014:32:22.000000` and `out_time=N/A` before it has produced a
 * frame, and reporting those as "0% done" is fine while reporting them as a
 * real sample is not.
 */
export function parseOutTime(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length !== 3) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

  const total = hours * 3600 + minutes * 60 + seconds;
  return total >= 0 ? total : null;
}

/**
 * ffmpeg's `-progress pipe:1` output, which is `key=value` lines terminated by
 * a `progress=continue` or `progress=end` line.
 *
 * Kept as a class with a buffer because a pipe splits wherever it likes: a
 * single read can end halfway through `out_tim`. Pure string handling, so
 * `tests/unit/main/ffmpegProgress.spec.ts` owns it, which is coverage the
 * wrapper's own stderr scraping never had.
 */
export class ProgressParser {
  private buffer = '';

  /** Seconds of output produced, one entry per progress block in this chunk. */
  push(chunk: string): number[] {
    this.buffer += chunk;

    const lines = this.buffer.split(/\r?\n/);
    // Whatever follows the last newline is a partial line; keep it for next time.
    this.buffer = lines.pop() ?? '';

    const samples: number[] = [];
    for (const line of lines) {
      const index = line.indexOf('=');
      if (index <= 0) continue;

      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();

      // `out_time_us` is unambiguous; `out_time_ms` is a long-standing
      // misnomer that also carries microseconds, so it is not read at all.
      if (key === 'out_time_us') {
        const micros = Number(value);
        if (Number.isFinite(micros) && micros >= 0) samples.push(micros / 1_000_000);
        continue;
      }

      if (key === 'out_time') {
        const seconds = parseOutTime(value);
        if (seconds !== null) samples.push(seconds);
      }
    }

    return samples;
  }
}

/**
 * Run one ffmpeg command as a promise that can actually be cancelled.
 *
 * A killed process arrives as a non-zero exit, so an abort is translated back
 * into a `CancelledError` rather than being reported as a failed render.
 */
export function runFfmpeg(command: FfmpegCommand | string[], opts: RunOptions = {}): Promise<void> {
  const { signal, onProgress, durationSec, timeoutMs = 60 * 60_000 } = opts;
  const args = Array.isArray(command) ? command : command.args();

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());

    let settled = false;
    let killed = false;
    let stderr = '';

    // `-progress pipe:1` is a machine readable readout on stdout, which the
    // wrapper did not use: it scraped the human readable stats off stderr
    // instead, and those are formatted for a terminal. `-nostats` turns that
    // half off, so stderr carries only the banner and any real error, which is
    // what the failure message should say.
    const child = spawn(FFMPEG_PATH, ['-nostats', '-progress', 'pipe:1', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const parser = new ProgressParser();

    const kill = (): void => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* the process may already be gone */
      }
    };

    const timer = setTimeout(kill, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', kill);
    };

    signal?.addEventListener('abort', kill, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      const samples = parser.push(chunk);
      if (!onProgress || !durationSec || durationSec <= 0) return;
      for (const seconds of samples) {
        onProgress(Math.max(0, Math.min(1, seconds / durationSec)));
      }
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      // Keep the tail: ffmpeg says what went wrong on its last lines, and a
      // graph that fails per frame can produce megabytes before it gives up.
      if (stderr.length > STDERR_LIMIT) stderr = stderr.slice(-STDERR_LIMIT);
    });

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(killed || signal?.aborted ? new CancelledError() : error);
    });

    child.on('close', (code, closeSignal) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (killed || signal?.aborted) return reject(new CancelledError());
      if (code === 0) return resolve();

      const how = code === null ? `signal ${closeSignal}` : `code ${code}`;
      reject(new Error(`ffmpeg exited with ${how}\n${stderr.trim()}`));
    });
  });
}

/** What `ffprobe -show_format -show_streams` hands back, narrowed to what is read. */
export interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  channels?: number;
  channel_layout?: string;
  tags?: Record<string, string | undefined>;
  [key: string]: unknown;
}

export interface FfprobeData {
  streams?: FfprobeStream[];
  format?: { duration?: string | number; [key: string]: unknown };
}

/**
 * One ffprobe, as JSON.
 *
 * `probeDurationSec` runs one of these for every tile in the library, so this
 * is the hot path: the wrapper's own `ffprobe` helper spawned the same process
 * and then reshaped the result, and nothing here wanted the reshaping.
 */
export async function ffprobeJson(filePath: string, timeoutMs = 60_000): Promise<FfprobeData> {
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ];

  return new Promise<FfprobeData>((resolve, reject) => {
    const child = spawn(FFPROBE_PATH, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}\n${stderr.trim()}`));

      try {
        resolve(JSON.parse(stdout) as FfprobeData);
      } catch {
        reject(new Error(`ffprobe returned something that is not JSON: ${stdout.slice(0, 200)}`));
      }
    });
  });
}
