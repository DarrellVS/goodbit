import { BaseAction } from './BaseAction.js';
import { CancelledError, ffmpegCommand, runFfmpeg } from '../services/ffmpegProcess.js';
import { withTimeout } from '../utils/withTimeout.js';
import { Cancelled } from '../services/mediaQueue.js';
import { detectEncoders, decodeArgs, probeVideo, TONEMAP_FILTER } from '../services/encoders.js';

export type GenerateFrameStripInput = {
  inputPath: string;
  outputPath: string;
  /** Aborted when the source is about to be rewritten. */
  signal?: AbortSignal;
  frames?: number;
  scale?: number;
};

/**
 * The strip of stills shown behind a clip on a timeline.
 *
 * The frames are spread across the whole clip, one every `duration / frames`
 * seconds. They used to be sampled at a flat `fps=1` and tiled, which on
 * anything longer than ten seconds quietly produced a strip of only the first
 * ten seconds, and both the Trim page and the editor stretch that strip across
 * the full width, so every frame sat under the wrong moment.
 *
 * Decoding is done on the GPU where there is one; these are 3440x1440 AV1 files
 * and software decoding them is the slow part. HDR sources are tone mapped, or
 * the strip comes out the same washed-out grey the exports used to be.
 */
export class GenerateFrameStripAction extends BaseAction<GenerateFrameStripInput, void> {
  async execute({
    inputPath,
    outputPath,
    frames = 10,
    scale = 320,
    signal,
  }: GenerateFrameStripInput): Promise<void> {
    if (signal?.aborted) throw new Cancelled();
    const [encoders, info] = await Promise.all([
      detectEncoders().catch(() => null),
      probeVideo(inputPath).catch(() => null),
    ]);

    const duration = info?.durationSec ?? 0;
    // One frame per slice of the clip. Sampling from the middle of each slice
    // avoids a black first frame and a cut-off last one.
    const rate = duration > 0 ? frames / duration : 1;

    const inputOptions = encoders ? await decodeArgs(encoders, inputPath) : [];

    /*
     * Shrink first, then tone map. This is the whole cost of the strip.
     *
     * `-hwaccel cuda` alone decodes on the GPU and copies every frame back at
     * full size, and the tone map then runs over 3440x1440 pixels, converting
     * each one to float32 and back, on the CPU, for every frame sampled. These
     * recordings are HDR, so that path is the normal one rather than the
     * exception: a 29 s clip took **28 seconds**.
     *
     * Decoding on the card, scaling there, and only then bringing the frames
     * back means the tone map runs over 320x134 instead, which is about a
     * hundred and fifteen times fewer pixels. Measured on that same clip:
     * **28.1 s down to 3.0 s**, with the same picture out the other end
     * (identical dimensions, mean brightness 49 against 48).
     *
     * Tone mapping after scaling is not identical to tone mapping before it,
     * but at a hundred and thirty four pixels tall the difference is not
     * visible and nine seconds of waiting is.
     */
    const wantsGpu = inputOptions.some((option) => option.includes('cuda'));
    const tile = `tile=${frames}x1:padding=2:color=black`;

    /** The cheap way, and the way that always works, in that order. */
    const plans: Array<{ input: string[]; filters: string[] }> = [];

    if (wantsGpu) {
      // 10 bit stays 10 bit until the tone map, which is what reads it.
      const format = info?.isHdr ? 'p010le' : 'yuv420p';
      plans.push({
        input: [...inputOptions, '-hwaccel_output_format cuda'],
        filters: [
          `fps=${rate.toFixed(6)}`,
          `scale_cuda=${scale}:-2:format=${format}`,
          'hwdownload',
          `format=${format}`,
          ...(info?.isHdr ? [TONEMAP_FILTER] : []),
          tile,
        ],
      });
    }

    /*
     * The fallback is not only for machines without a GPU.
     *
     * NVDEC refuses some files it looks like it should take: a plain h264 High
     * 3440x1440 clip here fails with `CUDA_ERROR_INVALID_VALUE` and ffmpeg
     * decodes it in software instead, without telling the filter graph. A
     * graph asking for `scale_cuda` then meets frames already in system memory
     * and fails outright, so nothing is written and the timeline stays empty.
     *
     * On this road the tone map has to come first, because `scale` cannot read
     * PQ sensibly, and that is the expensive order. It is the price of being
     * correct on a file the card will not take.
     */
    plans.push({
      input: inputOptions.filter((option) => !option.includes('hwaccel')),
      filters: [
        `fps=${rate.toFixed(6)}`,
        ...(info?.isHdr ? [TONEMAP_FILTER] : []),
        `scale=${scale}:-1`,
        tile,
      ],
    });

    let lastError: unknown;
    for (const plan of plans) {
      try {
        await withTimeout(
          runFfmpeg(
            ffmpegCommand(inputPath)
              .inputOptions(plan.input)
              .outputOptions(['-frames:v', '1', '-vf', plan.filters.join(','), '-y'])
              .output(outputPath),
            /*
             * Killed, not awaited, when the clip is about to be replaced.
             *
             * ffmpeg holds a read handle while it runs, and on Windows that
             * stops the trim renaming the file. Waiting for a strip of a clip
             * that is about to stop existing is the worst of both.
             */
            { signal },
          ),
          5 * 60_000,
        );
        return;
      } catch (error) {
        if (error instanceof Cancelled) throw error;
        if (error instanceof CancelledError) throw new Cancelled();
        lastError = error;
      }
    }

    throw lastError;
  }
}
