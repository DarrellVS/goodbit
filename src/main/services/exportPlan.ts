import {
  cropFilterFor,
  outputSizeFor,
  targetKbpsFor,
  type ClipAudioSelection,
  type ClipAudioTrack,
  type ExportFormat,
  type ProjectTimelineTransition,
} from '@shared/index.js';
import { encoderArgs, TONEMAP_FILTER, type EncoderInfo, type ProbeInfo } from './encoders.js';
import { planMixedAudio } from './clipAudio.js';

/**
 * What an export has to render, worked out before any of it runs.
 *
 * The export used to be "one segment per clip, then the concat demuxer", and
 * that shape cannot express a transition. A cross dissolve is not a filter you
 * can apply to a segment: it needs frames from *two* sources at the same
 * instant, and the concat demuxer only ever puts one finished file after
 * another.
 *
 * So the unit of work stops being a clip and becomes a **step**, and there are
 * two kinds. A `cut` is one source, trimmed, exactly what a segment was. A
 * `dissolve` is two sources overlapping, which is one ffmpeg command reading
 * two files. Both produce one file, all of them the same shape, and the concat
 * demuxer joins the lot without knowing which was which. Nothing downstream of
 * the render loop changed, and an export with no transitions produces byte for
 * byte the commands it produced before.
 *
 * The dissolve is its own segment rather than a second pass over the joined
 * movie on purpose. Re-encoding the whole picture to blend half a second of it
 * would put every frame through a second generation for the sake of the two
 * that needed it, and the file this app writes is often the only copy of that
 * moment.
 *
 * **A dissolve shortens the movie.** The overlap is taken out of both
 * neighbours: the outgoing clip gives up its last `d` seconds and the incoming
 * one its first `d`, and the blend between them is `d` long, so a timeline of
 * `sum(lengths)` becomes `sum(lengths) - sum(dissolves)`. The alternative is to
 * borrow frames from outside the trims, which keeps the length but plays frames
 * the person deliberately cut off, and only works at all when there are frames
 * there to borrow. Predictable beats clever here.
 *
 * Everything in this file takes values and returns values, which is the point:
 * a filter graph is a string assembled from a dozen numbers and labels, it is
 * wrong by one label at runtime and not before, and `tests/unit/main/
 * exportPlan.spec.ts` reads the whole command back without ffmpeg being
 * anywhere near it.
 */

/** Below this a segment is not worth writing, and matches the old floor on a trim. */
export const MIN_SEGMENT_SEC = 0.05;

/**
 * Below this a dissolve is a cut with extra steps.
 *
 * Two frames at 60. Anything shorter costs a whole segment, an encode and a
 * join to produce something nobody can see, so it is dropped and said so.
 */
export const MIN_DISSOLVE_SEC = 0.1;

/**
 * Both defaults every segment is normalised to, so the concat demuxer will
 * join them. A timebase mismatch is refused outright; a frame rate mismatch is
 * accepted and then plays at the wrong speed.
 */
export const SEGMENT_FPS = 60;
const SEGMENT_TIMESCALE = 60000;

/** The picture quality an export's segments are encoded at. Unchanged. */
const EXPORT_QUALITY = 21;

/**
 * What a clip's own audio tracks are, and what was decided about them.
 *
 * Carried on the source rather than looked up here, because this module is
 * pure and a track list comes off an ffprobe. Both absent is the ordinary
 * case: one stream, taken as recorded.
 */
export interface SourceAudio {
  audioTracks?: ClipAudioTrack[];
  audio?: ClipAudioSelection[];
}

/** One clip on the video lane, with its file already resolved. */
export interface ExportClip extends SourceAudio {
  clipId: number;
  filePath: string;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
}

/** One piece of one source file that a step reads. */
export interface SegmentSource extends SourceAudio {
  clipId: number;
  filePath: string;
  /** Where in the source this piece begins, in seconds. */
  startSec: number;
  volume: number;
  muted: boolean;
}

export interface CutStep {
  kind: 'cut';
  source: SegmentSource;
  durationSec: number;
  /** What the progress readout says while this one runs. */
  label: string;
}

export interface DissolveStep {
  kind: 'dissolve';
  /** The clip being left, read from its last `durationSec` seconds. */
  from: SegmentSource;
  /** The clip being arrived at, read from its first `durationSec` seconds. */
  to: SegmentSource;
  durationSec: number;
  label: string;
}

export type RenderStep = CutStep | DissolveStep;

export interface RenderPlan {
  steps: RenderStep[];
  /** How long the finished movie will be. A dissolve makes this shorter. */
  durationSec: number;
  /**
   * Transitions that were asked for and could not be given as asked.
   *
   * Logged rather than thrown. A dissolve that had to be shortened still
   * produces the movie somebody asked for, and failing the whole render over
   * half a frame of overlap would be worse than saying so.
   */
  notes: string[];
}

/** Milliseconds, which is all `-ss` and `-t` carry anyway. */
function ms(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/**
 * Turn a timeline into an ordered list of files to render.
 *
 * The clamping is the part worth reading. A dissolve eats into both of its
 * neighbours, and a clip can have one on each side, so the length a clip has to
 * give up is the sum of the two. A one second clip between two dissolves of
 * 0.6s has nothing left in the middle, and a segment of zero or negative length
 * is an ffmpeg command that either fails or writes a file the concat demuxer
 * then chokes on.
 *
 * One pass, left to right, scaling both transitions touching a clip down
 * proportionally when they overrun it. Scaling a transition down only ever
 * frees budget for the clip to its left, which has already been settled, so the
 * pass never has to go back.
 */
export function buildRenderPlan(
  clips: ExportClip[],
  transitions: ProjectTimelineTransition[] = [],
): RenderPlan {
  const notes: string[] = [];

  if (clips.length === 0) return { steps: [], durationSec: 0, notes };

  const lengths = clips.map((clip) => Math.max(MIN_SEGMENT_SEC, ms(clip.trimEnd - clip.trimStart)));

  // Gap `i` sits between clip `i` and clip `i + 1`, so there is one fewer gap
  // than there are clips, and none at all on a single clip timeline.
  const gaps = new Array<number>(Math.max(0, clips.length - 1)).fill(0);

  for (const transition of transitions) {
    const { afterIndex, type, durationSec } = transition ?? ({} as ProjectTimelineTransition);

    if (type !== 'crossDissolve') {
      notes.push(`ignored a transition of an unknown type: ${String(type)}`);
      continue;
    }
    if (!Number.isInteger(afterIndex) || afterIndex < 0 || afterIndex >= gaps.length) {
      notes.push(`ignored a transition after clip ${String(afterIndex)}, which has nothing after it`);
      continue;
    }
    if (!Number.isFinite(durationSec) || durationSec < MIN_DISSOLVE_SEC) {
      notes.push(
        `dropped the dissolve after clip ${afterIndex + 1}: ` +
          `${String(durationSec)}s is shorter than ${MIN_DISSOLVE_SEC}s`,
      );
      continue;
    }

    // Last one wins. A caller sending two transitions for one gap has a bug,
    // and picking one is better than rendering both into the same seam.
    if (gaps[afterIndex] > 0) {
      notes.push(`two transitions were sent for the gap after clip ${afterIndex + 1}; kept the last`);
    }
    gaps[afterIndex] = ms(durationSec);
  }

  const asked = [...gaps];

  for (let i = 0; i < clips.length; i++) {
    // What this clip can give away and still be worth writing as a segment.
    const budget = Math.max(0, lengths[i] - MIN_SEGMENT_SEC);
    const head = i > 0 ? gaps[i - 1] : 0;
    const tail = i < gaps.length ? gaps[i] : 0;
    const used = head + tail;
    if (used <= budget || used === 0) continue;

    const scale = budget / used;
    if (i > 0) gaps[i - 1] = ms(head * scale);
    if (i < gaps.length) gaps[i] = ms(tail * scale);
  }

  for (let gap = 0; gap < gaps.length; gap++) {
    if (gaps[gap] > 0 && gaps[gap] < MIN_DISSOLVE_SEC) gaps[gap] = 0;
    if (asked[gap] > 0 && gaps[gap] === 0) {
      notes.push(
        `dropped the dissolve after clip ${gap + 1}: clip ${gap + 1} and clip ${gap + 2} ` +
          'are too short to give up that much between them',
      );
    } else if (asked[gap] > 0 && gaps[gap] < asked[gap]) {
      notes.push(
        `shortened the dissolve after clip ${gap + 1} from ${asked[gap]}s to ${gaps[gap]}s ` +
          'so both clips keep something of their own',
      );
    }
  }

  const steps: RenderStep[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const head = i > 0 ? gaps[i - 1] : 0;
    const tail = i < gaps.length ? gaps[i] : 0;
    const bodySec = ms(lengths[i] - head - tail);

    steps.push({
      kind: 'cut',
      source: {
        clipId: clip.clipId,
        filePath: clip.filePath,
        startSec: ms(clip.trimStart + head),
        volume: clip.volume,
        muted: clip.muted,
        audioTracks: clip.audioTracks,
        audio: clip.audio,
      },
      durationSec: Math.max(MIN_SEGMENT_SEC, bodySec),
      label: `Cutting clip ${i + 1} of ${clips.length}`,
    });

    if (tail > 0) {
      const next = clips[i + 1];
      steps.push({
        kind: 'dissolve',
        from: {
          clipId: clip.clipId,
          filePath: clip.filePath,
          // The frames the body segment stopped short of, so the two meet
          // exactly and no frame is played twice.
          startSec: ms(clip.trimStart + lengths[i] - tail),
          volume: clip.volume,
          muted: clip.muted,
          audioTracks: clip.audioTracks,
          audio: clip.audio,
        },
        to: {
          clipId: next.clipId,
          filePath: next.filePath,
          startSec: ms(next.trimStart),
          volume: next.volume,
          muted: next.muted,
          audioTracks: next.audioTracks,
          audio: next.audio,
        },
        durationSec: tail,
        label: `Blending clip ${i + 1} into clip ${i + 2}`,
      });
    }
  }

  const durationSec = ms(steps.reduce((total, step) => total + step.durationSec, 0));
  return { steps, durationSec, notes };
}

/**
 * One ffmpeg invocation, as values rather than as a built command.
 *
 * Kept as plain arrays so the whole thing can be read back in a test. The
 * action turns it into a `FfmpegCommand`; nothing here knows fluent-ffmpeg
 * exists.
 */
export interface SegmentCommand {
  inputs: Array<{ path: string; options: string[] }>;
  /** `-filter_complex` stages, or null when the output options carry a plain `-vf`. */
  complexFilter: string[] | null;
  outputOptions: string[];
}

/** What a step needs to know about one of its sources. */
export interface SourceContext {
  info: ProbeInfo;
  /** Already resolved, because `decodeArgs` probes the file for a pre-roll. */
  decode: string[];
}

export interface SegmentOptions {
  format: ExportFormat;
  framePos: number;
  encoders: EncoderInfo;
}

/**
 * The picture filters for one source, in the order they cost the least.
 *
 * **Crop before tone map.** `TONEMAP_FILTER` converts every pixel to float32
 * and back on the CPU, and it is the most expensive thing in an export by a
 * wide margin, so it should never see a pixel that is about to be thrown away.
 * A vertical cut of a 3440x1440 recording keeps 810 columns of 3440.
 *
 * Measured on a five second vertical export of a real recording: **5.8 seconds
 * tone mapping first, 2.8 seconds cropping first**, and the frames are
 * bit-identical, same `framemd5` either way. They commute because `npl` is a
 * constant rather than something measured off the frame, so hable maps a pixel
 * to the same value whether or not its neighbours are still there. The order
 * was the other way round for as long as the export has existed, which is the
 * same mistake, in the same direction, that made a frame strip take 28 seconds.
 */
function pictureFilters(
  info: ProbeInfo,
  opts: SegmentOptions,
  scaleTo?: { width: number; height: number },
): string[] {
  const filters: string[] = [];

  const crop = cropFilterFor(opts.format, info.width, info.height, opts.framePos);
  if (crop) filters.push(crop);
  // Same reason as the crop, one step further: a resize belongs on the cheap
  // side of the tone map, never the expensive one.
  if (scaleTo) filters.push(`scale=${scaleTo.width}:${scaleTo.height}`);
  if (info.isHdr) filters.push(TONEMAP_FILTER);

  return filters;
}

/** Audio options shared by both kinds of step, so three bitrates do not become four. */
const SEGMENT_AUDIO = ['-c:a aac', '-b:a 256k', '-ac 2', '-ar 48000'];

/** Whether a source contributes sound: the timeline's mute, and then the file's own. */
function isAudible(source: SegmentSource, info: ProbeInfo): boolean {
  return !source.muted && info.audioStreams > 0;
}

/**
 * Cut one segment out of one source, which is what every segment used to be.
 *
 * The source is decoded on the GPU where the machine has one and the file
 * survives it, an HDR source is tone mapped, and only the first audio track is
 * taken because OBS writes six identical copies of the same mix.
 */
export function buildCutCommand(
  step: CutStep,
  context: SourceContext,
  opts: SegmentOptions,
): SegmentCommand {
  const { info, decode } = context;
  const filters = pictureFilters(info, opts);
  const targetKbps = targetKbpsFor(opts.format, info.width, info.height, info.kbps);

  const audible = isAudible(step.source, info);
  /*
   * The sound, which is a mixdown rather than a pick as soon as a track was
   * touched. `volume` on the timeline used to be a `-af` of its own; it is
   * folded into the same chain now, because two filters cannot both claim one
   * output.
   */
  const audioPlan = audible
    ? planMixedAudio(
        step.source.audioTracks ?? [],
        step.source.audio ?? [],
        step.source.volume,
        0,
      )
    : null;

  const outputOptions = [`-t ${step.durationSec.toFixed(3)}`];
  const complexFilter: string[] = [];
  let videoMap = '-map 0:v:0';

  /*
   * One graph or two, and never both for one stream.
   *
   * ffmpeg refuses `-vf` beside `-filter_complex` where they meet, so a source
   * whose sound has to be rebuilt brings its picture into the same graph. The
   * filters themselves are unchanged, and so is their order: crop before tone
   * map, which is the difference between 2.8 seconds and 5.8.
   */
  if (audioPlan?.filterComplex) {
    if (filters.length) {
      complexFilter.push(`[0:v:0]${filters.join(',')}[v]`);
      videoMap = '-map [v]';
    }
    complexFilter.push(audioPlan.filterComplex);
  } else if (filters.length) {
    outputOptions.push(`-vf ${filters.join(',')}`);
  }

  outputOptions.push(
    ...encoderArgs(opts.encoders, { quality: EXPORT_QUALITY, targetKbps }),
    videoMap,
    // Every segment needs the same stream layout or the concat demuxer
    // refuses to join them.
    `-r ${SEGMENT_FPS}`,
    `-video_track_timescale ${SEGMENT_TIMESCALE}`,
  );

  if (audioPlan) {
    outputOptions.push(`-map ${audioPlan.map}`, ...SEGMENT_AUDIO);
  } else {
    outputOptions.push('-an');
  }

  outputOptions.push('-y');

  return {
    inputs: [{ path: step.source.filePath, options: [...decode, `-ss ${step.source.startSec.toFixed(3)}`] }],
    complexFilter: complexFilter.length ? complexFilter : null,
    outputOptions,
  };
}

/**
 * Blend the end of one clip into the start of the next.
 *
 * Four things here each exist because the obvious version does not work.
 *
 * **`-t` is an input option, not an output one.** `xfade` with `offset=0`
 * outputs `in0 + in1 - duration`, so an unbounded first input runs the segment
 * to the end of the recording. Limiting the inputs bounds the output at exactly
 * the overlap and stops both decoders the moment they have enough, which on a
 * 3440x1440 AV1 source is most of the cost of the step.
 *
 * **Both sides are tone mapped, separately.** A transition decodes two files,
 * and one of them being HDR while the other is not is normal the moment an
 * imported clip meets a recording. Tone mapping the pair as one would be
 * wrong for whichever side did not need it; getting it wrong the other way
 * leaves half the dissolve grey.
 *
 * **Both sides get their own decode arguments.** `decodeArgs` drops hwaccel for
 * a file that still carries a discard flagged pre-roll, because NVDEC decodes
 * those frames against a keyframe that is no longer in the file and renders
 * them as flat green. A dissolve reads two files and has to ask that question
 * twice, or a green pre-roll arrives halfway through a blend.
 *
 * **`fps`, `format` and `setsar` are in the graph, not in the output options.**
 * `xfade` is a framesync filter: it refuses two inputs that disagree about
 * frame rate, pixel format or sample aspect, and `-r` acts after the graph has
 * already had to agree.
 */
export function buildDissolveCommand(
  step: DissolveStep,
  from: SourceContext,
  to: SourceContext,
  opts: SegmentOptions,
): SegmentCommand {
  const duration = step.durationSec.toFixed(3);

  const fromSize = outputSizeFor(opts.format, from.info.width, from.info.height);
  const toSize = outputSizeFor(opts.format, to.info.width, to.info.height);

  const tail = (extra: string[]): string[] => [
    ...extra,
    `fps=${SEGMENT_FPS}`,
    'format=yuv420p',
    'setsar=1',
  ];

  // Two recordings of different shapes already break the concat demuxer, so
  // this is not the place that has to solve it. It is the place that would
  // fail first and least clearly: `xfade` stops with "First input link
  // parameters do not match", naming neither file. Matching the incoming side
  // to the outgoing one at least produces the movie that was asked for.
  const mismatched = toSize.width !== fromSize.width || toSize.height !== fromSize.height;

  const complexFilter = [
    `[0:v]${tail(pictureFilters(from.info, opts)).join(',')}[xa]`,
    `[1:v]${tail(pictureFilters(to.info, opts, mismatched ? fromSize : undefined)).join(',')}[xb]`,
    `[xa][xb]xfade=transition=fade:duration=${duration}:offset=0[v]`,
  ];

  const audible = isAudible(step.from, from.info) && isAudible(step.to, to.info);
  if (audible) {
    /*
     * Each side mixed on its own before they are blended.
     *
     * Asked twice for the same reason the tone map and the decode arguments
     * are: a transition reads two files, and the answers differ. One side can
     * have a muted voice chat while the other is a single-track import.
     */
    const fromPlan = planMixedAudio(
      step.from.audioTracks ?? [],
      step.from.audio ?? [],
      step.from.volume,
      0,
    );
    const toPlan = planMixedAudio(
      step.to.audioTracks ?? [],
      step.to.audio ?? [],
      step.to.volume,
      1,
    );
    if (fromPlan.filterComplex) complexFilter.push(fromPlan.filterComplex);
    if (toPlan.filterComplex) complexFilter.push(toPlan.filterComplex);

    // A plan with nothing to do hands back a stream specifier rather than a
    // label, and a specifier cannot be read twice inside a graph. The one that
    // needed nothing is read straight from the input instead.
    const fromLabel = fromPlan.filterComplex ? fromPlan.map : '[0:a:0]';
    const toLabel = toPlan.filterComplex ? toPlan.map : '[1:a:0]';

    complexFilter.push(
      `${fromLabel}asetpts=PTS-STARTPTS[aa]`,
      `${toLabel}asetpts=PTS-STARTPTS[ab]`,
      // Triangular on both sides, which is the linear cross fade the picture is
      // doing. A constant power curve would lift the middle of the blend above
      // either clip on its own, which on game audio reads as a swell.
      `[aa][ab]acrossfade=d=${duration}:c1=tri:c2=tri[a]`,
    );
  }

  const targetKbps = targetKbpsFor(
    opts.format,
    from.info.width,
    from.info.height,
    from.info.kbps,
  );

  const outputOptions = [
    ...encoderArgs(opts.encoders, { quality: EXPORT_QUALITY, targetKbps }),
    '-map [v]',
    `-r ${SEGMENT_FPS}`,
    `-video_track_timescale ${SEGMENT_TIMESCALE}`,
  ];

  if (audible) {
    outputOptions.push('-map [a]', ...SEGMENT_AUDIO);
  } else {
    // A segment's stream layout has to match its neighbours' or the concat
    // demuxer will not join them, and a muted clip already produces a body
    // segment with no audio track. So a dissolve is silent whenever either
    // side of it is, which keeps it matching the segment it is next to.
    outputOptions.push('-an');
  }

  outputOptions.push('-y');

  return {
    inputs: [
      {
        path: step.from.filePath,
        options: [...from.decode, `-ss ${step.from.startSec.toFixed(3)}`, `-t ${duration}`],
      },
      {
        path: step.to.filePath,
        options: [...to.decode, `-ss ${step.to.startSec.toFixed(3)}`, `-t ${duration}`],
      },
    ],
    complexFilter,
    outputOptions,
  };
}

/**
 * How much work each pass is, so the bar and the ETA mean something.
 *
 * Progress used to be `(step + fraction) / steps`, which treats a two second
 * clip and a two minute clip as the same amount of work. A dissolve makes that
 * visibly wrong rather than merely inaccurate: it is half a second of render
 * sitting between two twenty second ones, and an even bar would jump a whole
 * step for it and then appear to stall. `etaSeconds` in `services/jobs.ts` is
 * derived from this number, so a bar that lies makes the estimate lie with it.
 *
 * The unit is a second of movie encoded. A pass that copies the picture and
 * only touches the sound, the join, the music mix and the loudness pass, costs
 * a small fraction of one that encodes it.
 */
export const COPY_PASS_WEIGHT = 0.05;

export function planWork(plan: RenderPlan, copyPasses: number): number {
  const encode = plan.steps.reduce((total, step) => total + step.durationSec, 0);
  return encode + copyPasses * plan.durationSec * COPY_PASS_WEIGHT;
}
