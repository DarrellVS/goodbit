import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';
import { AppDataSource, VIDEOS_ROOT } from '../data-source.js';

import { Clip } from '../entity/Clip.js';
import { BaseAction } from './BaseAction.js';
import { resolveAudioPath } from '../services/audioLibrary.js';
import { GetClipAudioTracksAction } from './GetClipAudioTracksAction.js';
import type { ClipAudioSelection, ClipAudioTrack } from '@shared/index.js';
import { setJobProgress } from '../services/jobs.js';
import { ffmpegCommand, ffprobeJson, runFfmpeg, type FfmpegCommand } from '../services/ffmpegProcess.js';
import { detectEncoders, decodeArgs, probeVideo } from '../services/encoders.js';
import {
  buildCutCommand,
  buildDissolveCommand,
  buildRenderPlan,
  planWork,
  COPY_PASS_WEIGHT,
  MIN_SEGMENT_SEC,
  type ExportClip,
  type RenderStep,
  type SegmentCommand,
  type SegmentOptions,
  type SourceContext,
} from '../services/exportPlan.js';
import type { ExportFormat, ProjectTimelineTransition } from '@shared/index.js';
import { EXPORTS_FOLDER } from '@shared/constants/videoFiles.js';


interface TimelineClipData {
  clipId: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
  /**
   * Mutes and levels for this clip's own audio tracks.
   *
   * A clip's fader (`volume`) turns all of its sound down together; this is
   * the level of one source inside it, which only exists on a recording made
   * through GoodBit's multi-track OBS setup. Absent on every other clip and on
   * every timeline saved before this existed.
   */
  audio?: ClipAudioSelection[];
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
  /**
   * Cross dissolves, in the gaps between adjacent clips. See
   * `services/exportPlan.ts`: a dissolve is taken out of both of its
   * neighbours, so asking for one makes the movie shorter.
   */
  transitions?: ProjectTimelineTransition[];
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
      transitions = [],
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
    // `findByIds` was removed in TypeORM 1.0; `In()` is the replacement it
    // names, and it is the same query.
    const dbClips = await clipRepo.findBy({ id: In(clips.map((c) => c.clipId)) });
    const clipMap = new Map(dbClips.map((c) => [c.id, c]));

    // A render is not a recording, and the folder it lands in is one level down
    // from the videos root, where a folder name *is* a game name. So every
    // export used to grow a game called "Editor" in the sidebar, sitting next
    // to Battlefield 6 and sharing its name with the Editor screen.
    //
    // "Exports" at least says what it is and collides with nothing. The older
    // folder is carried over once, if it is there and the new one is not, so a
    // library that already has renders in it ends up with one folder rather
    // than two.
    const sharedDir = path.join(VIDEOS_ROOT, EXPORTS_FOLDER);
    const legacyDir = path.join(VIDEOS_ROOT, 'Editor');
    if (!existsSync(sharedDir) && existsSync(legacyDir)) {
      try {
        await fs.rename(legacyDir, sharedDir);
        console.log(`[export] renamed the Editor folder to ${EXPORTS_FOLDER}`);
      } catch (error) {
        console.error('[export] could not rename the Editor folder:', error);
      }
    }

    /*
     * A movie cut from one game belongs to that game.
     *
     * `<videosRoot>/<Game>/Exports/` when every clip on the timeline came from
     * the same game, and the old top level `Exports/` when they did not,
     * because a montage of four games has no one game folder to claim it and
     * picking the first would be a guess.
     *
     * The game is taken from the rows rather than from the timeline, since the
     * timeline carries ids and a clip can have been moved between games since
     * it was put on there. A single-clip timeline counts as single-game; that
     * is not a special case, it is the general rule with one element.
     */
    const timelineGames = new Set(
      clips.map((timelineClip) => clipMap.get(timelineClip.clipId)?.game).filter(Boolean),
    );
    const homeGame = timelineGames.size === 1 ? [...timelineGames][0]! : null;
    // Never into the pseudo-game the flat folder already is: a montage of
    // montages would otherwise land in `Exports/Exports/`.
    const ownGame = homeGame && homeGame !== EXPORTS_FOLDER ? homeGame : null;

    const editorDir = ownGame
      ? path.join(VIDEOS_ROOT, ownGame, EXPORTS_FOLDER)
      : sharedDir;
    const relDir = ownGame ? path.join(ownGame, EXPORTS_FOLDER) : EXPORTS_FOLDER;
    await fs.mkdir(editorDir, { recursive: true });

    /*
     * One scratch directory per export, not one shared by all of them.
     *
     * This was `<videosRoot>/.temp` for every export at once, and both exits
     * from the block below delete it whole. Two exports running together is a
     * normal thing to do, there is nothing stopping it, and the first one to
     * finish or fail took the other one's segments out from under ffmpeg
     * mid-encode. The failure reads as a corrupt render or a missing file,
     * with nothing in it that points at the other export.
     *
     * Stamped so an abandoned one says when it was left behind, and carrying
     * a random tail because two exports started in the same millisecond, which
     * a batch or an MCP caller can do, would otherwise share a name again. The
     * parent `.temp` stays, which costs nothing: it is dot prefixed, so the
     * watcher, the scan and `cleanupEmptyFolders` all skip it already.
     */
    const tempDir = path.join(
      VIDEOS_ROOT,
      '.temp',
      `export-${Date.now()}-${randomUUID().slice(0, 8)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });

    const tempFiles: string[] = [];
    const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);
    const outputFilename = `${outputName}.mp4`;
    const outputPath = path.join(editorDir, outputFilename);
    const relPath = path.join(relDir, outputFilename);

    try {
      const encoders = await detectEncoders();

      const stamp = Date.now();

      // What to render, worked out before any of it runs, so the progress bar
      // knows the size of the job and a dissolve that will not fit is reported
      // once rather than discovered by ffmpeg.
      /*
       * The track list, once per clip that has a decision on it.
       *
       * An ffprobe each, and only for the clips that need one: a timeline of
       * forty clips where nobody touched the sound does no extra work at all.
       * Read here rather than taken from the timeline, so the indices the
       * render acts on come off the file as it is now.
       */
      const trackLists = new Map<number, ClipAudioTrack[]>();
      for (const timelineClip of clips) {
        if (!timelineClip.audio?.length || trackLists.has(timelineClip.clipId)) continue;
        trackLists.set(
          timelineClip.clipId,
          await new GetClipAudioTracksAction()
            .execute({ clipId: timelineClip.clipId })
            .catch(() => []),
        );
      }

      const timeline: ExportClip[] = clips.map((timelineClip) => {
        const dbClip = clipMap.get(timelineClip.clipId);
        if (!dbClip) throw new Error(`Clip ${timelineClip.clipId} not found`);
        return {
          clipId: timelineClip.clipId,
          filePath: dbClip.filePath,
          trimStart: timelineClip.trimStart,
          trimEnd: timelineClip.trimEnd,
          volume: timelineClip.volume,
          muted: timelineClip.muted,
          audio: timelineClip.audio,
          audioTracks: trackLists.get(timelineClip.clipId),
        };
      });

      const plan = buildRenderPlan(timeline, transitions);
      for (const note of plan.notes) console.log(`[export] ${note}`);

      // Music and loudness each add a pass after the cutting, on top of the
      // join. All three copy the picture, so they are cheap next to a segment.
      const copyPasses = 1 + (audible.length > 0 ? 1 : 0) + (normalizeLoudness ? 1 : 0);
      // Floored at the shortest segment anyone can ask for, because this is
      // about to be a divisor and an empty plan would make it zero.
      const totalWork = Math.max(planWork(plan, copyPasses), MIN_SEGMENT_SEC);
      /** What one of those passes is worth on the bar, in the same unit. */
      const copyWork = plan.durationSec * COPY_PASS_WEIGHT;
      let doneWork = 0;

      const segmentOptions: SegmentOptions = { format, framePos, encoders };

      /*
       * One probe and one `decodeArgs` per *file*, not per step.
       *
       * A dissolve reads the same two files its neighbouring cuts do, so a
       * three clip timeline with two dissolves went from three probes to
       * five, and `decodeArgs` runs a second ffprobe of its own to ask whether
       * the file carries a discard flagged pre-roll. Both answers are
       * properties of the file, and the file does not change during a render.
       */
      const contexts = new Map<string, SourceContext>();
      const contextFor = async (filePath: string): Promise<SourceContext> => {
        const existing = contexts.get(filePath);
        if (existing) return existing;

        const context: SourceContext = {
          info: await probeVideo(filePath),
          decode: await decodeArgs(encoders, filePath),
        };
        contexts.set(filePath, context);
        return context;
      };

      for (let i = 0; i < plan.steps.length; i++) {
        if (signal?.aborted) throw new Error('Cancelled');

        const step = plan.steps[i];
        const tempOutputPath = path.join(tempDir, `segment_${i}_${stamp}.mp4`);
        tempFiles.push(tempOutputPath);

        const command = await this.buildSegment(step, segmentOptions, contextFor);
        const at = doneWork;

        await this.runSegment(command, tempOutputPath, {
          signal,
          durationSec: step.durationSec,
          onProgress: (fraction) =>
            progress(((at + fraction * step.durationSec) / totalWork) * 100, step.label),
        });

        doneWork += step.durationSec;
      }

      progress((doneWork / totalWork) * 100, 'Joining the clips');

      const concatContent = tempFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent, 'utf-8');

      // The picture is finished after the join and is only ever copied from
      // here on, so the encode above is the one and only generation. That is
      // as true of a dissolve as of a cut: the blend is its own segment, so
      // the frames on either side of it are never encoded twice.
      let current = path.join(tempDir, `joined_${stamp}.mp4`);
      await this.concatenateClips(concatListPath, current, signal);
      doneWork += copyWork;

      if (audible.length > 0) {
        if (signal?.aborted) throw new Error('Cancelled');
        progress((doneWork / totalWork) * 100, 'Mixing the music');
        const mixed = path.join(tempDir, `mixed_${stamp}.mp4`);
        await this.mixAudioTracks(current, audible, mixed, signal);
        current = mixed;
        doneWork += copyWork;
      }

      if (normalizeLoudness) {
        if (signal?.aborted) throw new Error('Cancelled');
        progress((doneWork / totalWork) * 100, 'Evening out the sound');
        const evened = path.join(tempDir, `loud_${stamp}.mp4`);
        await this.normalizeLoudness(current, evened, signal);
        current = evened;
        doneWork += copyWork;
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
        // Without the dot, which is what the scan writes
        // (`path.extname(filename).slice(1)`). Written with one here, so every
        // export failed the equality check on the very next sweep and was
        // rewritten and re-probed for ever.
        extension: 'mp4',
        displayName: outputName,
        game: ownGame ?? EXPORTS_FOLDER,
        sizeBytes: stats.size,
        fileModifiedAt: stats.mtime,
        // The row and the scan have to agree about this, or the first sweep
        // after an export would decide the row had changed.
        recordedAt: stats.mtime,
        isExport: true,
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
   * What ffmpeg is asked for, for one step of the plan.
   *
   * The deciding is in `services/exportPlan.ts` and returns plain arrays; this
   * only resolves what each source needs probing for. Split that way because a
   * filter graph is a string built out of a dozen numbers and labels, it is
   * wrong by one label at runtime and not before, and a value can be read back
   * in a unit test while a `FfmpegCommand` cannot.
   */
  private async buildSegment(
    step: RenderStep,
    options: SegmentOptions,
    contextFor: (filePath: string) => Promise<SourceContext>,
  ): Promise<SegmentCommand> {
    if (step.kind === 'cut') {
      return buildCutCommand(step, await contextFor(step.source.filePath), options);
    }

    return buildDissolveCommand(
      step,
      await contextFor(step.from.filePath),
      await contextFor(step.to.filePath),
      options,
    );
  }

  /**
   * Run one built segment.
   *
   * Every input gets its own options, which is not a detail: `-hwaccel` binds
   * to the input that follows it, and a dissolve can want the GPU for one of
   * its two files and not the other, because `decodeArgs` refuses it for a file
   * that still carries a discard flagged pre-roll.
   */
  private runSegment(
    command: SegmentCommand,
    outputPath: string,
    opts: { signal?: AbortSignal; durationSec: number; onProgress?: (fraction: number) => void },
  ): Promise<void> {
    let built: FfmpegCommand = ffmpegCommand();
    for (const input of command.inputs) {
      built = built.input(input.path).inputOptions(input.options);
    }

    if (command.complexFilter) built = built.complexFilter(command.complexFilter);

    return runFfmpeg(built.outputOptions(command.outputOptions).output(outputPath), {
      signal: opts.signal,
      onProgress: opts.onProgress,
      durationSec: opts.durationSec,
      timeoutMs: 60 * 60_000,
    });
  }

  private concatenateClips(
    concatListPath: string,
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return runFfmpeg(
      ffmpegCommand()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy', '-movflags +faststart', '-y'])
        .output(outputPath),
      { signal, timeoutMs: 30 * 60_000 },
    );
  }

  private hasAudioStream(filePath: string): Promise<boolean> {
    return ffprobeJson(filePath)
      .then((data) => (data.streams ?? []).some((stream) => stream.codec_type === 'audio'))
      .catch(() => false);
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

    let command: FfmpegCommand = ffmpegCommand(videoPath);
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
      ffmpegCommand(inputPath)
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
