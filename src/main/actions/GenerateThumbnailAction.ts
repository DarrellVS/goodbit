import { BaseAction } from './BaseAction.js';
import { CancelledError, ffmpegCommand, runFfmpeg } from '../services/ffmpegProcess.js';
import { withTimeout } from '../utils/withTimeout.js';
import { Cancelled } from '../services/mediaQueue.js';
import { detectEncoders, decodeArgs, probeVideo, TONEMAP_FILTER } from '../services/encoders.js';

export type GenerateThumbnailInput = {
  inputPath: string;
  outputPath: string;
  /** Aborted when the source is about to be rewritten. */
  signal?: AbortSignal;
  seekSec?: number;
  quality?: number;
  /**
   * How wide the picture is kept.
   *
   * A card is about 480 CSS pixels, so 1280 covers a high density display with
   * room to spare. It used to keep the source's own 3440x1440, which is the
   * expensive decision in this file: see the note in `execute`.
   */
  maxWidth?: number;
};

/**
 * One frame, for the card in the library.
 *
 * HDR sources are tone mapped. Without it the thumbnail comes out the washed-out
 * grey that an HDR picture always becomes when it is dumped into an SDR file,
 * which is the same bug that was fixed in the exports and in the frame strips,
 * and was still here because a thumbnail is one frame and nobody looks at it
 * next to the source.
 */
export class GenerateThumbnailAction extends BaseAction<GenerateThumbnailInput, void> {
  async execute({
    inputPath,
    outputPath,
    seekSec = 1,
    quality = 4,
    maxWidth = 1280,
    signal,
  }: GenerateThumbnailInput): Promise<void> {
    if (signal?.aborted) throw new Cancelled();

    const [encoders, info] = await Promise.all([
      detectEncoders().catch(() => null),
      probeVideo(inputPath).catch(() => null),
    ]);

    const inputOptions = encoders ? await decodeArgs(encoders, inputPath) : [];

    /*
     * Small, and shrunk before the tone map rather than after it.
     *
     * The thumbnail used to be kept at the recording's own size, so a card
     * showing a 3440x1440 clip handed the renderer a picture nineteen
     * megabytes wide once decoded, and a screen of forty of them cost most of
     * a gigabyte of bitmaps. On disk it was 181 KB each where 47 KB shows the
     * same thing.
     *
     * The generation cost came from the same place as the frame strip's: these
     * recordings are HDR, and the tone map converts every pixel to float32 and
     * back, on the CPU. Scaling first, on the card, means it runs over a
     * thumbnail instead of a frame. Measured on a 3440x1440 HDR clip:
     * 731 ms down to 363 ms, and 18.9 MB down to 2.6 MB once decoded.
     */
    const wantsGpu = inputOptions.some((option) => option.includes('cuda'));

    /** The cheap way, and the way that always works, in that order. */
    const plans: Array<{ input: string[]; filters: string[] }> = [];

    if (wantsGpu) {
      const format = info?.isHdr ? 'p010le' : 'yuv420p';
      plans.push({
        input: [...inputOptions, '-hwaccel_output_format cuda'],
        filters: [
          `scale_cuda=${maxWidth}:-2:format=${format}`,
          'hwdownload',
          `format=${format}`,
          ...(info?.isHdr ? [TONEMAP_FILTER] : []),
        ],
      });
    }

    /*
     * The fallback is not optional, and it is not only for machines without a
     * GPU.
     *
     * NVDEC refuses some files it looks like it should take: a plain h264 High
     * 3440x1440 clip here fails with `CUDA_ERROR_INVALID_VALUE` and ffmpeg
     * quietly decodes it in software instead. The filters do not know that, so
     * a graph asking for `scale_cuda` then meets frames that are already in
     * system memory, fails with "impossible to convert between the formats",
     * and writes nothing. The card in the library then shows black for ever,
     * because a missing file looks exactly like a thumbnail that has not been
     * made yet.
     */
    plans.push({
      input: inputOptions.filter((option) => !option.includes('hwaccel')),
      filters: [...(info?.isHdr ? [TONEMAP_FILTER] : []), `scale=${maxWidth}:-2`],
    });

    let lastError: unknown;
    for (const plan of plans) {
      try {
        await withTimeout(
          runFfmpeg(
            ffmpegCommand(inputPath)
              .inputOptions(plan.input)
              .frames(1)
              .seekInput(seekSec)
              .outputOptions([`-q:v ${quality}`, '-vf', plan.filters.join(',')])
              .output(outputPath),
            // A thumbnail of a clip that is about to be rewritten is worth
            // less than the rename it is blocking.
            { signal },
          ),
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
