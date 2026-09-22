import { TONEMAP_FILTER, type ProbeInfo } from './encoders.js';

/**
 * Squeezing a clip that is already on disk, as values rather than as a command.
 *
 * Kept apart from the action for the same reason `exportPlan.ts` is: the
 * decisions here are a dozen flags and a filter graph, they are wrong by one
 * argument at runtime and not before, and a value can be read back in a test
 * while a spawned process cannot.
 *
 * **This replaces the only copy of a moment**, which puts it in the same class
 * as a trim rather than as an export, and it inherits the trim's rules. Three
 * of them are load-bearing and each cost a debugging session somewhere else in
 * this codebase:
 *
 * - **An HDR source must be tone mapped.** OBS writes PQ/bt2020 10 bit, and
 *   reading that as sRGB is what made every export grey and washed out. Here
 *   it would bake the grey into the recording.
 * - **The audio tracks must survive.** A recording made through GoodBit's own
 *   OBS setup carries one track per source, which is the entire point of that
 *   setup: the clutch is fine and the friend chewing on voice chat is not, and
 *   one press fixes it *later*. Flattening them here would silently destroy
 *   the thing the multi-track recording exists for, and nothing on screen
 *   would say so until somebody tried to mute a track next month. So `-c:a
 *   copy` and `-map 0:a?`, both of which are cheap and neither of which is the
 *   default.
 * - **The decode arguments come from the caller**, because `decodeArgs` probes
 *   the file: NVDEC refuses files it looks like it should take, and it refuses
 *   a source carrying a discard-flagged pre-roll from a pre-3.1 lossless cut.
 *   Those files are still on disk and they have to compress correctly.
 */

export interface CompressPlan {
  /** Options for the input, before `-i`. Hardware decode, or nothing. */
  inputOptions: string[];
  /** Everything after the input. */
  outputOptions: string[];
  /** The `-vf` chain, empty when the source is already SDR. */
  filters: string[];
}

export interface CompressOptions {
  info: ProbeInfo;
  /** Already resolved by `decodeArgs`, which probes the file. */
  decode: string[];
  /**
   * The size to aim for, already built.
   *
   * `shareEncoderArgs`, which is what `compressTrims` and `compressPublished`
   * already mean by "compressed". Handed in finished rather than recomputed
   * from a quality and a ceiling, so there is exactly one place in the app
   * that decides what share size is: a third independent notion of the word
   * would give three answers to one question, and reading the ceiling back out
   * of that list to rebuild it here is the same mistake with extra steps.
   */
  encoder: string[];
}

export function planCompression(options: CompressOptions): CompressPlan {
  const { info, decode, encoder } = options;

  // An HDR source read as if it were sRGB is what made every export grey. Here
  // it would be baked into the recording, with no original left to redo it
  // from.
  const filters = info.isHdr ? [TONEMAP_FILTER] : [];

  const outputOptions = [
    ...encoder,
    '-map 0:v:0',
    /*
     * Every audio stream, copied.
     *
     * `-map 0:a?` with the `?` so a silent clip is not an error, and `-c:a
     * copy` so six tracks stay six tracks. Re-encoding them would cost quality
     * on the one part of the file that is already small, and dropping to one
     * would destroy the multi-track recording silently.
     */
    '-map 0:a?',
    '-c:a copy',
    '-movflags +faststart',
    '-y',
  ];

  if (filters.length) outputOptions.unshift(`-vf ${filters.join(',')}`);

  return { inputOptions: [...decode], outputOptions, filters };
}

/**
 * Whether the result is worth keeping.
 *
 * A compression that made the file *bigger* is not a failure of the pipeline,
 * it is a clip that was already smaller than the preset aims for: a short
 * 720p import, or something already squeezed once. Replacing the original with
 * it would spend quality to gain nothing, so the action throws the new file
 * away and says so.
 *
 * The floor is not zero. A saving of two percent is inside the noise of one
 * encoder against another and is not worth a generation loss on the only copy
 * of a moment.
 */
export const MIN_SAVING_FRACTION = 0.05;

export function worthKeeping(originalBytes: number, newBytes: number): boolean {
  if (originalBytes <= 0 || newBytes <= 0) return false;
  return newBytes <= originalBytes * (1 - MIN_SAVING_FRACTION);
}

/**
 * Whether the compressed file is the same recording.
 *
 * The one check that catches a truncated encode, which is what a full disk or
 * a killed process leaves behind: a file that plays, opens on the right frame
 * and stops early. Its size would look like a spectacular saving.
 *
 * A frame of tolerance, because a re-encode ends on a frame boundary and the
 * container rounds.
 */
export const DURATION_TOLERANCE_SEC = 0.5;

export function sameLength(originalSec: number, newSec: number): boolean {
  if (!(originalSec > 0) || !(newSec > 0)) return false;
  return Math.abs(originalSec - newSec) <= DURATION_TOLERANCE_SEC;
}
