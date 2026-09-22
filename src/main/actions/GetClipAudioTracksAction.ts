import { BaseAction } from './BaseAction.js';
import { ffprobeJson } from '../services/ffmpegProcess.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { readManifest } from '../services/obs/setup.js';
import { describeClipAudioTracks, type ProbedAudioStream } from '../services/clipAudio.js';

/* The shape is agreed in `src/shared`; produced here. */
import type { ClipAudioTrack } from '@shared/index.js';
export type { ClipAudioTrack };

/**
 * What sound a clip holds, and what each stream of it is.
 *
 * Two reads, and the second is the one that makes this worth having. ffprobe
 * says there are six audio streams; it cannot say that the fourth one is voice
 * chat, because nothing in the file does. That is in the manifest the OBS
 * setup wrote, which is the only record anywhere of which device fed which
 * track.
 *
 * Cheap enough to do on every open of the trimmer: one ffprobe, no decoding.
 * The expensive half of reading a clip is `WatchClipHudAction`, and this is
 * deliberately not near it.
 */
export class GetClipAudioTracksAction extends BaseAction<{ clipId: number }, ClipAudioTrack[]> {
  async execute({ clipId }: { clipId: number }): Promise<ClipAudioTrack[]> {
    const clip = await AppDataSource.getRepository(Clip).findOneByOrFail({ id: clipId });

    const probed = await ffprobeJson(clip.filePath);

    const streams = ((probed.streams ?? []) as Array<ProbedAudioStream & { codec_type?: string }>)
      .filter((stream) => stream.codec_type === 'audio');

    /*
     * The mapping is only ever a name, never a count.
     *
     * `describeClipAudioTracks` refuses one that does not fit the file it is
     * describing, which is the case that matters: a person who reruns the
     * setup with a different set of devices has clips on disk from before, and
     * confidently calling stream 3 voice chat when voice chat has moved is
     * worse than calling it "Track 3".
     */
    return describeClipAudioTracks(streams, readManifest()?.audioTracks ?? []);
  }
}
