import { describe, expect, it } from 'vitest';
import {
  buildCutCommand,
  buildDissolveCommand,
  buildRenderPlan,
  planWork,
  COPY_PASS_WEIGHT,
  MIN_DISSOLVE_SEC,
  MIN_SEGMENT_SEC,
  type CutStep,
  type DissolveStep,
  type ExportClip,
  type SegmentOptions,
  type SourceContext,
} from '../../../src/main/services/exportPlan.js';
import type { EncoderInfo, ProbeInfo } from '../../../src/main/services/encoders.js';

/**
 * What the export asks ffmpeg for, read back without ffmpeg.
 *
 * Two things are worth checking here and neither of them needs a GPU.
 *
 * **The arithmetic of a dissolve.** It is taken out of both of its neighbours,
 * so a clip with one on each side gives up the sum of the two, and a clip that
 * cannot afford that has to be discovered before ffmpeg is asked to write a
 * segment of negative length. The bench in `scripts/export-check.mjs` proves
 * one real movie; this proves the cases a real movie would take an hour to
 * cover.
 *
 * **The filter graph.** It is a string built from a dozen numbers and labels,
 * and a graph that is wrong by one label fails at runtime and nowhere earlier.
 * `xfade` in particular is a framesync filter: it refuses two inputs that
 * disagree about frame rate, pixel format or sample aspect, so the stages that
 * make them agree are load-bearing and invisible.
 */

const encoders: EncoderInfo = {
  ffmpegVersion: '6.1.1',
  h264: 'libx264',
  hardware: false,
  hwaccel: null,
};

const options: SegmentOptions = { format: 'original', framePos: 0.5, encoders };

/** An ordinary OBS recording: ultrawide, PQ, with sound. */
function probe(overrides: Partial<ProbeInfo> = {}): ProbeInfo {
  return {
    durationSec: 30,
    width: 3440,
    height: 1440,
    kbps: 90_000,
    videoCodec: 'av1',
    pixFmt: 'yuv420p10le',
    colorTransfer: 'smpte2084',
    colorPrimaries: 'bt2020',
    audioStreams: 1,
    isHdr: true,
    ...overrides,
  };
}

function context(overrides: Partial<ProbeInfo> = {}, decode: string[] = []): SourceContext {
  return { info: probe(overrides), decode };
}

function clip(id: number, trimStart: number, trimEnd: number): ExportClip {
  return {
    clipId: id,
    filePath: `C:\\Clips\\Game\\clip-${id}.mp4`,
    trimStart,
    trimEnd,
    volume: 1,
    muted: false,
  };
}

describe('the plan a timeline turns into', () => {
  it('is one cut per clip when nothing was asked for', () => {
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 2, 6)]);

    expect(plan.steps.map((step) => step.kind)).toEqual(['cut', 'cut']);
    expect(plan.durationSec).toBe(9);
    expect(plan.notes).toEqual([]);
  });

  it('puts a dissolve between two clips and takes it out of both', () => {
    // The whole arithmetic in one assertion. Clip 1 gives up its last second,
    // clip 2 its first, and the blend between them is one second long, so
    // 5 + 4 becomes 8 rather than 9.
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 2, 6)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 1 },
    ]);

    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: 'cut', durationSec: 4 }),
      expect.objectContaining({ kind: 'dissolve', durationSec: 1 }),
      expect.objectContaining({ kind: 'cut', durationSec: 3 }),
    ]);
    expect(plan.durationSec).toBe(8);
  });

  it('reads the blend out of the frames the two bodies stopped short of', () => {
    // A frame played twice, or one skipped over, is the failure this rules
    // out: the dissolve starts where the first body ended and ends where the
    // second body starts.
    const plan = buildRenderPlan([clip(1, 10, 15), clip(2, 2, 6)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 1 },
    ]);

    const [first, blend, second] = plan.steps;
    expect(first).toMatchObject({ kind: 'cut', source: { startSec: 10 }, durationSec: 4 });
    expect(blend).toMatchObject({
      kind: 'dissolve',
      // 10 + 5 - 1: the last second of clip 1, which its body stopped at.
      from: { startSec: 14, clipId: 1 },
      to: { startSec: 2, clipId: 2 },
    });
    // 2 + 1: clip 2's body begins where the blend leaves it.
    expect(second).toMatchObject({ kind: 'cut', source: { startSec: 3 }, durationSec: 3 });
  });

  it('shortens a dissolve rather than letting a clip go to nothing', () => {
    // Half a second of overlap out of each end of a clip that is only 0.6s
    // long leaves nothing in the middle, which is a segment ffmpeg either
    // refuses or writes at zero length for the concat demuxer to choke on.
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 0.6), clip(3, 0, 5)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 0.5 },
      { afterIndex: 1, type: 'crossDissolve', durationSec: 0.5 },
    ]);

    const bodies = plan.steps.filter((step) => step.kind === 'cut');
    for (const body of bodies) expect(body.durationSec).toBeGreaterThanOrEqual(MIN_SEGMENT_SEC);

    const blends = plan.steps.filter((step) => step.kind === 'dissolve');
    expect(blends).toHaveLength(2);
    // 0.6 minus the floor, split evenly between the two that wanted it.
    for (const blend of blends) expect(blend.durationSec).toBeCloseTo(0.275, 3);
    expect(plan.notes.join(' ')).toContain('shortened the dissolve after clip 1');
  });

  it('drops a dissolve that shortening cannot save', () => {
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 0.1), clip(3, 0, 5)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 1 },
      { afterIndex: 1, type: 'crossDissolve', durationSec: 1 },
    ]);

    expect(plan.steps.map((step) => step.kind)).toEqual(['cut', 'cut', 'cut']);
    expect(plan.notes.join(' ')).toContain('too short to give up');
  });

  it('never lets a dissolve make a clip longer than it was trimmed to', () => {
    // A dissolve borrows nothing from outside the trim, so however much is
    // asked for, no source is read past `trimEnd` or before `trimStart`.
    const clips = [clip(1, 4, 9), clip(2, 1, 7)];
    const plan = buildRenderPlan(clips, [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 2 },
    ]);

    for (const step of plan.steps) {
      const sources = step.kind === 'cut' ? [step.source] : [step.from, step.to];
      for (const source of sources) {
        const owner = clips.find((c) => c.clipId === source.clipId);
        expect(source.startSec).toBeGreaterThanOrEqual(owner!.trimStart);
        expect(source.startSec + step.durationSec).toBeLessThanOrEqual(owner!.trimEnd + 1e-9);
      }
    }
  });

  it('ignores a transition that points at a gap the timeline does not have', () => {
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 5)], [
      // The last clip has nothing after it to dissolve into.
      { afterIndex: 1, type: 'crossDissolve', durationSec: 1 },
      { afterIndex: -1, type: 'crossDissolve', durationSec: 1 },
    ]);

    expect(plan.steps.map((step) => step.kind)).toEqual(['cut', 'cut']);
    expect(plan.notes).toHaveLength(2);
  });

  it('drops a dissolve too short to see rather than spending a segment on it', () => {
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 5)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: MIN_DISSOLVE_SEC / 2 },
    ]);

    expect(plan.steps.map((step) => step.kind)).toEqual(['cut', 'cut']);
    expect(plan.notes.join(' ')).toContain('shorter than');
  });

  it('survives a body with no numbers in it', () => {
    // Every one of these arrives from an unchecked JSON body, and `NaN`
    // passes every comparison by failing all of them.
    const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 5)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: Number.NaN },
      { afterIndex: 0.5, type: 'crossDissolve', durationSec: 1 },
      { afterIndex: 0, type: 'wipe' as 'crossDissolve', durationSec: 1 },
    ]);

    expect(plan.steps.map((step) => step.kind)).toEqual(['cut', 'cut']);
    expect(plan.durationSec).toBe(10);
  });
});

describe('what the progress bar is told the job is worth', () => {
  it('weights a step by its length rather than counting steps', () => {
    // The reason this exists: a half second dissolve between two twenty second
    // clips is a fortieth of the work and used to be a third of the bar.
    const plan = buildRenderPlan([clip(1, 0, 20), clip(2, 0, 20)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 0.5 },
    ]);

    const work = planWork(plan, 1);
    const blend = plan.steps.find((step) => step.kind === 'dissolve')!;

    expect(blend.durationSec / work).toBeLessThan(0.02);
    expect(work).toBeCloseTo(39.5 + 39.5 * COPY_PASS_WEIGHT, 6);
  });
});

describe('the command a cut comes out as', () => {
  it('is the one input, trimmed, tone mapped and normalised to the segment shape', () => {
    const plan = buildRenderPlan([clip(1, 2, 7)]);
    const command = buildCutCommand(plan.steps[0] as CutStep, context({}, ['-hwaccel cuda']), options);

    expect(command.complexFilter).toBeNull();
    expect(command.inputs).toEqual([
      { path: 'C:\\Clips\\Game\\clip-1.mp4', options: ['-hwaccel cuda', '-ss 2.000'] },
    ]);
    expect(command.outputOptions).toContain('-t 5.000');
    expect(command.outputOptions).toContain('-map 0:v:0');
    // Optional, because a recording with no sound at all is a recording, and
    // a hard map on one fails the segment rather than silencing it.
    expect(command.outputOptions).toContain('-map 0:a:0?');
    expect(command.outputOptions).toContain('-r 60');
    expect(command.outputOptions).toContain('-video_track_timescale 60000');
    expect(command.outputOptions.find((o) => o.startsWith('-vf '))).toContain('tonemap=hable');
  });

  it('crops before it tone maps, because the tone map is the expensive one', () => {
    const vertical: SegmentOptions = { ...options, format: '9x16' };
    const plan = buildRenderPlan([clip(1, 0, 5)]);
    const command = buildCutCommand(plan.steps[0] as CutStep, context(), vertical);

    const chain = command.outputOptions.find((o) => o.startsWith('-vf '))!;
    expect(chain.indexOf('crop=810:1440')).toBeGreaterThan(-1);
    expect(chain.indexOf('crop=')).toBeLessThan(chain.indexOf('tonemap='));
  });

  it('leaves the sound out when the clip is muted, and when the file has none', () => {
    const plan = buildRenderPlan([{ ...clip(1, 0, 5), muted: true }]);
    const muted = buildCutCommand(plan.steps[0] as CutStep, context(), options);
    expect(muted.outputOptions).toContain('-an');
    expect(muted.outputOptions).not.toContain('-map 0:a:0');

    const silentFile = buildRenderPlan([clip(1, 0, 5)]);
    const silent = buildCutCommand(
      silentFile.steps[0] as CutStep,
      context({ audioStreams: 0 }),
      options,
    );
    expect(silent.outputOptions).toContain('-an');
  });
});

describe('the command a dissolve comes out as', () => {
  const plan = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 5)], [
    { afterIndex: 0, type: 'crossDissolve', durationSec: 0.75 },
  ]);
  const step = plan.steps.find((s) => s.kind === 'dissolve') as DissolveStep;

  it('bounds both inputs, or xfade runs the segment to the end of the recording', () => {
    // `xfade` at offset 0 outputs `in0 + in1 - duration`, so an unbounded
    // first input does not produce a blend, it produces the rest of the file.
    const command = buildDissolveCommand(step, context(), context(), options);

    expect(command.inputs).toEqual([
      { path: 'C:\\Clips\\Game\\clip-1.mp4', options: ['-ss 4.250', '-t 0.750'] },
      { path: 'C:\\Clips\\Game\\clip-2.mp4', options: ['-ss 0.000', '-t 0.750'] },
    ]);
  });

  it('asks each file for its own decode, because only one of them may be safe on the GPU', () => {
    // `decodeArgs` drops hwaccel for a file that still carries a discard
    // flagged pre-roll, and NVDEC renders those frames as flat green. A
    // transition reads two files and has to ask twice.
    const command = buildDissolveCommand(
      step,
      context({}, ['-hwaccel cuda']),
      context({}, []),
      options,
    );

    expect(command.inputs[0].options[0]).toBe('-hwaccel cuda');
    expect(command.inputs[1].options[0]).toBe('-ss 0.000');
  });

  it('tone maps each side separately, so half the blend cannot come out grey', () => {
    const command = buildDissolveCommand(step, context(), context({ isHdr: false }), options);

    expect(command.complexFilter![0]).toContain('tonemap=hable');
    expect(command.complexFilter![1]).not.toContain('tonemap=hable');
    // Both still land on the same pixel format, or xfade refuses the pair.
    expect(command.complexFilter![0]).toContain('format=yuv420p');
    expect(command.complexFilter![1]).toContain('format=yuv420p');
  });

  it('makes both sides agree on rate and aspect before the blend, not after', () => {
    const command = buildDissolveCommand(step, context(), context(), options);

    expect(command.complexFilter![0]).toMatch(/fps=60,format=yuv420p,setsar=1\[xa\]$/);
    expect(command.complexFilter![1]).toMatch(/fps=60,format=yuv420p,setsar=1\[xb\]$/);
    expect(command.complexFilter![2]).toBe(
      '[xa][xb]xfade=transition=fade:duration=0.750:offset=0[v]',
    );
    expect(command.outputOptions).toContain('-map [v]');
  });

  it('cross fades the sound over the same length as the picture', () => {
    const command = buildDissolveCommand(step, context(), context(), options);

    expect(command.complexFilter).toContain('[aa][ab]acrossfade=d=0.750:c1=tri:c2=tri[a]');
    expect(command.outputOptions).toContain('-map [a]');
    expect(command.outputOptions).toContain('-c:a aac');
  });

  it('is silent when either side is, so it matches the segment beside it', () => {
    // A muted clip already produces a body segment with no audio track, and
    // the concat demuxer will not join segments whose stream layouts differ.
    const muted = buildRenderPlan([{ ...clip(1, 0, 5), muted: true }, clip(2, 0, 5)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 0.75 },
    ]);
    const command = buildDissolveCommand(
      muted.steps.find((s) => s.kind === 'dissolve') as DissolveStep,
      context(),
      context(),
      options,
    );

    expect(command.outputOptions).toContain('-an');
    expect(command.complexFilter!.some((stage) => stage.includes('acrossfade'))).toBe(false);
  });

  it('matches two differently shaped sources rather than letting xfade refuse them', () => {
    const command = buildDissolveCommand(
      step,
      context(),
      context({ width: 1920, height: 1080 }),
      options,
    );

    expect(command.complexFilter![1]).toContain('scale=3440:1440');
    // On the cheap side of the tone map, the same rule the crop follows.
    expect(command.complexFilter![1].indexOf('scale=')).toBeLessThan(
      command.complexFilter![1].indexOf('tonemap='),
    );
  });

  it('carries the volume of each side into the blend', () => {
    const quiet = buildRenderPlan([{ ...clip(1, 0, 5), volume: 0.4 }, clip(2, 0, 5)], [
      { afterIndex: 0, type: 'crossDissolve', durationSec: 0.75 },
    ]);
    const command = buildDissolveCommand(
      quiet.steps.find((s) => s.kind === 'dissolve') as DissolveStep,
      context(),
      context(),
      options,
    );

    // The fader is applied where a per-track selection would be, so the two
    // cannot end up as two filters fighting over one output label.
    expect(command.complexFilter).toContain('[0:a:0]volume=0.400[mixa0]');
    expect(command.complexFilter).toContain('[mixa0]asetpts=PTS-STARTPTS[aa]');
    // The side nobody touched is still read straight from the input.
    expect(command.complexFilter).toContain('[1:a:0]asetpts=PTS-STARTPTS[ab]');
  });
});
