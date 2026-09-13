import path from 'node:path';
import fs from 'node:fs/promises';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { BaseAction } from './BaseAction.js';
import { ffmpegConfigured } from '../services/ffmpeg.js';
import { resolveAudioPath } from '../services/audioLibrary.js';
import { setJobProgress } from '../services/exportJobs.js';
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
}

export class ExportTimelineAction extends BaseAction<ExportTimelineInput, { clip: Clip }> {
  async execute(input: ExportTimelineInput): Promise<{ clip: Clip }> {
    const { clips, audio = [], exportId } = input;
    // The name is typed by the user now, and it is about to become a path.
    const outputName = this.sanitizeOutputName(input.outputName);
    // A muted or silent track would only add an ffmpeg input for nothing.
    const audible = audio.filter((track) => !track.muted && track.volume > 0);
    
    if (exportId) {
      setJobProgress(exportId, 0);
    }

    if (!clips || clips.length === 0) {
      throw new Error('No clips provided for export');
    }

    const clipRepo = AppDataSource.getRepository(Clip);
    const dbClips = await clipRepo.findByIds(clips.map(c => c.clipId));
    const clipMap = new Map(dbClips.map(c => [c.id, c]));

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
      const totalSteps = clips.length + 1;
      
      for (let i = 0; i < clips.length; i++) {
        const timelineClip = clips[i];
        const dbClip = clipMap.get(timelineClip.clipId);
        
        if (!dbClip) {
          throw new Error(`Clip ${timelineClip.clipId} not found`);
        }

        const inputPath = dbClip.filePath;
        const tempOutputPath = path.join(tempDir, `segment_${i}_${Date.now()}.mp4`);
        tempFiles.push(tempOutputPath);

        if (exportId) {
          setJobProgress(exportId, (i / totalSteps) * 100);
        }

        await this.processClipSegment(
          inputPath,
          tempOutputPath,
          timelineClip.trimStart,
          timelineClip.trimEnd,
          timelineClip.volume,
          timelineClip.muted
        );
      }
      
      if (exportId) {
        setJobProgress(exportId, (clips.length / totalSteps) * 100);
      }

      const concatContent = tempFiles.map(f => `file '${f}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent, 'utf-8');

      if (audible.length === 0) {
        await this.concatenateClips(concatListPath, outputPath);
      } else {
        // Music is mixed in a second pass: the concat demuxer can only copy
        // streams, so the soundtrack has to be laid over the finished cut.
        const mergedPath = path.join(tempDir, `merged_${Date.now()}.mp4`);
        await this.concatenateClips(concatListPath, mergedPath);
        await this.mixAudioTracks(mergedPath, audible, outputPath);
      }

      const stats = await fs.stat(outputPath);
      
      const newClip = clipRepo.create({
        filePath: outputPath,
        relPath: relPath,
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

  private processClipSegment(
    inputPath: string,
    outputPath: string,
    trimStart: number,
    trimEnd: number,
    volume: number,
    muted: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: FfmpegCommand = ffmpegConfigured(inputPath)
        .setStartTime(trimStart)
        .setDuration(trimEnd - trimStart)
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
        ]);

      if (muted) {
        command = command.outputOptions('-an');
      } else if (volume !== 1) {
        command = command.outputOptions(`-af volume=${volume}`);
      } else {
        command = command.outputOptions('-c:a aac');
      }

      command
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private concatenateClips(concatListPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpegConfigured()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c copy',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
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
    outputPath: string
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
      `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0:normalize=0,apad[aout]`
    );

    return new Promise((resolve, reject) => {
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
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }
}

