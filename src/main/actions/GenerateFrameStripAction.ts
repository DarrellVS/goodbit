import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { withTimeout } from '../utils/withTimeout.js';
import { detectEncoders, decodeArgs, probeVideo, TONEMAP_FILTER } from '../services/encoders.js';

export type GenerateFrameStripInput = {
  inputPath: string;
  outputPath: string;
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
  }: GenerateFrameStripInput): Promise<void> {
    const [encoders, info] = await Promise.all([
      detectEncoders().catch(() => null),
      probeVideo(inputPath).catch(() => null),
    ]);

    const duration = info?.durationSec ?? 0;
    // One frame per slice of the clip. Sampling from the middle of each slice
    // avoids a black first frame and a cut-off last one.
    const rate = duration > 0 ? frames / duration : 1;

    const filters: string[] = [];
    if (info?.isHdr) filters.push(TONEMAP_FILTER);
    filters.push(
      `fps=${rate.toFixed(6)}`,
      `scale=${scale}:-1`,
      `tile=${frames}x1:padding=2:color=black`,
    );

    const inputOptions = encoders ? decodeArgs(encoders) : [];

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        ffmpegConfigured(inputPath)
          .inputOptions(inputOptions)
          .outputOptions(['-frames:v', '1', '-vf', filters.join(','), '-y'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (e: unknown) => reject(e))
          .run();
      }),
      5 * 60_000,
    );
  }
}
