import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { withTimeout } from '../utils/withTimeout.js';
import { probeVideo, TONEMAP_FILTER } from '../services/encoders.js';

export type GenerateThumbnailInput = {
  inputPath: string;
  outputPath: string;
  seekSec?: number;
  quality?: number;
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
  }: GenerateThumbnailInput): Promise<void> {
    const info = await probeVideo(inputPath).catch(() => null);

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const command = ffmpegConfigured(inputPath).frames(1).seekInput(seekSec);

        const options = [`-q:v ${quality}`];
        if (info?.isHdr) options.push('-vf', TONEMAP_FILTER);

        command
          .outputOptions(options)
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (e: unknown) => reject(e))
          .run();
      }),
    );
  }
}
