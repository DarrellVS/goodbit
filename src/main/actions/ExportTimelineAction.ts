import path from 'node:path';
import fs from 'node:fs/promises';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { resolveAudioPath } from '../services/audioLibrary.js';
import { setJobProgress } from '../services/jobs.js';
import { runFfmpeg } from '../services/ffmpegRun.js';
import {
  detectEncoders,
  decodeArgs,
  encoderArgs,
  probeVideo,
  TONEMAP_FILTER,
  type EncoderInfo,
  type ProbeInfo,
} from '../services/encoders.js';
import {
  cropFilterFor,
  outputSizeFor,
  targetKbpsFor,
  type ExportFormat,
} from '@shared/index.js';
import type { FfmpegCommand } from 'fluent-ffmpeg';

interface TimelineClipData {
  clipId: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
}

interface TimelineAudioData {
  /** Filename of a track in the editor music folder. */
  trackId: string;
  /** Where the track starts on the timeline, in seconds. */
  startTime: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

interface ExportTimelineInput {
  clips: TimelineClipData[];
  audio?: TimelineAudioData[];
  outputName?: string;
  exportId?: string;
  /** The shape of the finished movie. Defaults to the source's own shape. */
  format?: ExportFormat;
  /** 0..1, where the crop window sits in the direction it can move. */
  framePos?: number;
  /** Even the whole movie out to -14 LUFS, the level the platforms settle on. */
  normalizeLoudness?: boolean;
  signal?: AbortSignal;
}

/** Loudness the platforms normalise to anyway, so the movie arrives already there. */
const LOUDNESS = { i: -14, tp: -1.5, lra: 11 };

export class ExportTimelineAction extends BaseAction<ExportTimelineInput, { clip: Clip }> {
  async execute(input: ExportTimelineInput): Promise<{ clip: Clip }> {
    const {
      clips,
      audio = [],
      exportId,
      format = 'original',
      framePos = 0.5,
      normalizeLoudness = false,
      signal,
    } = input;

    // The name is typed by the user now, and it is about to become a path.
    const outputName = this.sanitizeOutputName(input.outputName);
    // A muted or silent track would only add an ffmpeg input for nothing.
    const audible = audio.filter((track) => !track.muted && track.volume > 0);

    if (!clips || clips.length === 0) {
      throw new Error('No clips provided for export');
    }

    const progress = (percent: number, message?: string): void => {
      if (exportId) setJobProgress(exportId, percent, message);
    };
    progress(0, 'Getting ready');

    const clipRepo = AppDataSource.getRepository(Clip);
    const dbClips = await clipRepo.findByIds(clips.map((c) => c.clipId));
    const clipMap = new Map(dbClips.map((c) => [c.id, c]));

    const editorDir = path.join(VIDEOS_ROOT, 'Editor');
    await fs.mkdir(editorDir, { recursive: true });

    const tempDir = path.join(VIDEOS_ROOT, '.temp');
    await fs.mkdir(tempDir, { recursive: true });

    const tempFiles: string[] = [];
    const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);
    const outputFilename = `${outputName}.mp4`;
    const outputPath = path.join(editorDir, outputFilename);
    const relPath = path.join('Editor', outputFilename);

    try {
      const encoders = await detectEncoders();

      // Every segment is normalised to the same shape and timebase so the
      // concat demuxer can copy them together afterwards.
      const stamp = Date.now();
      // Music and loudness each add a pass after the cutting.
      const extraPasses = (audible.length > 0 ? 1 : 0) + (normalizeLoudness ? 1 : 0);
      const totalSteps = clips.length + 1 + extraPasses;

      for (let i = 0; i < clips.length; i++) {
        if (signal?.aborted) throw new Error('Cancelled');

        const timelineClip = clips[i];
        const dbClip = clipMap.get(timelineClip.clipId);
        if (!dbClip) throw new Error(`Clip ${timelineClip.clipId} not found`);

        const tempOutputPath = path.join(tempDir, `segment_${i}_${stamp}.mp4`);
        tempFiles.push(tempOutputPath);

        const info = await probeVideo(dbClip.filePath);
        const segmentDuration = Math.max(0.05, timelineClip.trimEnd - timelineClip.trimStart);

        await this.processClipSegment({
          inputPath: dbClip.filePath,
          outputPath: tempOutputPath,
          trimStart: timelineClip.trimStart,
          duration: segmentDuration,
          volume: timelineClip.volume,
          muted: timelineClip.muted,
          format,
          framePos,
          encoders,
          info,
          signal,
          onProgress: (fraction) =>
            progress(
              ((i + fraction) / totalSteps) * 100,
              `Cutting clip ${i + 1} of ${clips.length}`,
            ),
        });
      }

      progress((clips.length / totalSteps) * 100, 'Joining the clips');

      const concatContent = tempFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent, 'utf-8');

      // The picture is finished after the join and is only ever copied from
      // here on, so the encode above is the one and only generation.
      let current = path.join(tempDir, `joined_${stamp}.mp4`);
      await this.concatenateClips(concatListPath, current, signal);
      let step = clips.length + 1;

      if (audible.length > 0) {
        if (signal?.aborted) throw new Error('Cancelled');
        progress((step / totalSteps) * 100, 'Mixing the music');
        const mixed = path.join(tempDir, `mixed_${stamp}.mp4`);
        await this.mixAudioTracks(current, audible, mixed, signal);
        current = mixed;
        step++;
      }

      if (normalizeLoudness) {
        if (signal?.aborted) throw new Error('Cancelled');
        progress((step / totalSteps) * 100, 'Evening out the sound');
        const evened = path.join(tempDir, `loud_${stamp}.mp4`);
        await this.normalizeLoudness(current, evened, signal);
        current = evened;
        step++;
      }

      await fs.rename(current, outputPath).catch(async () => {
        // A rename across devices fails; copying is the fallback.
        await fs.copyFile(current, outputPath);
      });

      const stats = await fs.stat(outputPath);

      const newClip = clipRepo.create({
        filePath: outputPath,
        relPath,
        filename: outputFilename,
        extension: '.mp4',
        displayName: outputName,
        game: 'Editor',
        sizeBytes: stats.size,
        fileModifiedAt: stats.mtime,
        published: false,
        starred: false,
      });

      const savedClip = await clipRepo.save(newClip);

      await fs.rm(tempDir, { recursive: true, force: true });
      progress(100, 'Done');

      return { clip: savedClip };
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  /**
   * Reduce a user-supplied name to something safe to join onto a directory:
   * no separators, no drive letters, none of the characters Windows rejects.
   */
  private sanitizeOutputName(name?: string): string {
    const cleaned = (name ?? '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\.+$/, '')
      .trim()
      .slice(0, 120);

    return cleaned || `Export_${Date.now()}`;
  }

  /**
   * Cut one segment and make it match every other segment.
   *
   * Three things happen here that did not before. The source is decoded on the
   * GPU where there is one, these are 3440x1440 AV1 files and software
   * decoding them runs at 0.44x realtime, so this is the single biggest cost in
   * the whole export. An HDR source is tone mapped, without which the PQ curve
   * is read as sRGB and the result is the grey, washed-out picture the exports
   * used to have. And only the first audio track is taken, because OBS writes
   * six identical copies of the same mix.
   */
  private async processClipSegment(opts: {
    inputPath: string;
    outputPath: string;
    trimStart: number;
    duration: number;
    volume: number;
    muted: boolean;
    format: ExportFormat;
    framePos: number;
    encoders: EncoderInfo;
    info: ProbeInfo;
    signal?: AbortSignal;
    onProgress?: (fraction: number) => void;
  }): Promise<void> {
    const {
      inputPath, outputPath, trimStart, duration, volume, muted,
      format, framePos, encoders, info, signal, onProgress,
    } = opts;

    const filters: string[] = [];
    if (info.isHdr) filters.push(TONEMAP_FILTER);

    const crop = cropFilterFor(format, info.width, info.height, framePos);
    if (crop) filters.push(crop);

    const targetKbps = targetKbpsFor(format, info.width, info.height, info.kbps);

    let command: FfmpegCommand = ffmpegConfigured(inputPath)
      .inputOptions([...(await decodeArgs(encoders, inputPath)), `-ss ${trimStart.toFixed(3)}`])
      .outputOptions([`-t ${duration.toFixed(3)}`]);

    if (filters.length) command = command.outputOptions([`-vf ${filters.join(',')}`]);

    command = command.outputOptions([
      ...encoderArgs(encoders, { quality: 21, targetKbps }),
      '-map 0:v:0',
      // Every segment needs the same stream layout or the concat demuxer
      // refuses to join them.
      '-r 60',
      '-video_track_timescale 60000',
    ]);

    if (muted || info.audioStreams === 0) {
      command = command.outputOptions(['-an']);
    } else {
      command = command.outputOptions(['-map 0:a:0']);
      if (volume !== 1) command = command.outputOptions([`-af volume=${volume.toFixed(3)}`]);
      command = command.outputOptions(['-c:a aac', '-b:a 256k', '-ac 2', '-ar 48000']);
    }

    await runFfmpeg(command.outputOptions(['-y']).output(outputPath), {
      signal,
      onProgress,
      durationSec: duration,
      timeoutMs: 60 * 60_000,
    });
  }

  private concatenateClips(
    concatListPath: string,
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return runFfmpeg(
      ffmpegConfigured()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy', '-movflags +faststart', '-y'])
        .output(outputPath),
      { signal, timeoutMs: 30 * 60_000 },
    );
  }

  private hasAudioStream(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpegConfigured.ffprobe(filePath, (err, data) => {
        if (err) return resolve(false);
        resolve((data?.streams ?? []).some((stream) => stream.codec_type === 'audio'));
      });
    });
  }

  /**
   * Lay the music tracks over the finished cut.
   *
   * The video is copied, never re-encoded. `apad` plus `-shortest` is what
   * keeps the result exactly as long as the picture: without the pad a track
   * that ends early would truncate the video, and without `-shortest` a track
   * that runs long would extend it.
   */
  private async mixAudioTracks(
    videoPath: string,
    tracks: TimelineAudioData[],
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const videoHasAudio = await this.hasAudioStream(videoPath);

    let command: FfmpegCommand = ffmpegConfigured(videoPath);
    const filters: string[] = [];
    const mixLabels: string[] = videoHasAudio ? ['[0:a]'] : [];

    tracks.forEach((track, index) => {
      const filePath = resolveAudioPath(track.trackId);
      if (!filePath) throw new Error(`Unknown audio track: ${track.trackId}`);

      command = command.input(filePath);

      // Input 0 is the video, so the music tracks start at 1.
      const inputIndex = index + 1;
      const label = `a${inputIndex}`;
      const trimStart = Math.max(0, track.trimStart);
      const trimEnd = Math.max(trimStart + 0.05, track.trimEnd);
      const segmentDuration = trimEnd - trimStart;
      const delayMs = Math.max(0, Math.round(track.startTime * 1000));

      const stages = [
        `atrim=start=${trimStart.toFixed(3)}:end=${trimEnd.toFixed(3)}`,
        'asetpts=PTS-STARTPTS',
        `volume=${track.volume.toFixed(3)}`,
      ];

      const fadeIn = Math.min(track.fadeIn, segmentDuration);
      if (fadeIn > 0) stages.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);

      const fadeOut = Math.min(track.fadeOut, segmentDuration - fadeIn);
      if (fadeOut > 0) {
        stages.push(`afade=t=out:st=${(segmentDuration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
      }

      if (delayMs > 0) stages.push(`adelay=${delayMs}:all=1`);

      filters.push(`[${inputIndex}:a]${stages.join(',')}[${label}]`);
      mixLabels.push(`[${label}]`);
    });

    // normalize=0 keeps amix from dividing every input by the input count,
    // which would quietly duck the clip audio as soon as music is added.
    filters.push(
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0,apad[aout]`,
    );

    await runFfmpeg(
      command
        .complexFilter(filters)
        .outputOptions([
          '-map 0:v',
          '-map [aout]',
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath),
      { signal, timeoutMs: 30 * 60_000 },
    );
  }

  /**
   * One loudness for the whole movie.
   *
   * Game audio lands all over the place between titles and OBS setups, and the
   * platforms clamp whatever is too loud anyway. `loudnorm` puts the movie at
   * the level they normalise to, in one pass, with the picture copied.
   */
  private async normalizeLoudness(
    inputPath: string,
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!(await this.hasAudioStream(inputPath))) {
      // Nothing to even out; hand the file on untouched.
      await fs.copyFile(inputPath, outputPath);
      return;
    }

    await runFfmpeg(
      ffmpegConfigured(inputPath)
        .outputOptions([
          '-map 0:v:0',
          '-map 0:a:0',
          '-c:v copy',
          `-af loudnorm=I=${LOUDNESS.i}:TP=${LOUDNESS.tp}:LRA=${LOUDNESS.lra}`,
          '-c:a aac',
          '-b:a 256k',
          '-movflags +faststart',
          '-y',
        ])
        .output(outputPath),
      { signal, timeoutMs: 30 * 60_000 },
    );
  }
}
