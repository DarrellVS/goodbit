import { describe, expect, it } from 'vitest';
import { buildRenderPlan } from '../../../src/main/services/exportPlan.js';
import { planExportedMarks, placements } from '../../../src/main/services/exportMarks.js';

/**
 * Where a clip's marks land on the movie cut out of it.
 *
 * The naive formula, `(mark - trimStart) + clipStartTime`, is right only for a
 * timeline with no transitions on it. `buildRenderPlan` takes a dissolve out
 * of **both** its neighbours, so a clip with one on each side gives up the sum
 * and every mark after it slides. That is why this is computed from the plan
 * rather than from the timeline, and why it is tested against the real
 * `buildRenderPlan` rather than a hand-written list of steps: a change to how
 * the plan lays segments out has to fail here.
 *
 * Getting it wrong is invisible in the way this codebase keeps running into:
 * the band still draws, over a moment where nothing happens.
 */

function clip(clipId: number, trimStart: number, trimEnd: number) {
  return {
    clipId,
    filePath: `C:/clips/${clipId}.mp4`,
    trimStart,
    trimEnd,
    volume: 1,
    muted: false,
  };
}

const mark = (clipId: number, startSec: number, endSec: number) => ({ clipId, startSec, endSec });

describe('planExportedMarks, with plain cuts', () => {
  it('shifts a mark by where its clip landed', () => {
    // Two five second clips. A mark at 12..13 on the second one is 2..3 into
    // that clip's trim, and the second clip starts at 5 in the movie.
    const { steps } = buildRenderPlan([clip(1, 0, 5), clip(2, 10, 15)]);

    expect(planExportedMarks(steps, [mark(2, 12, 13)])).toEqual([
      expect.objectContaining({ startSec: 7, endSec: 8 }),
    ]);
  });

  it('drops a mark on footage the trim left out', () => {
    const { steps } = buildRenderPlan([clip(1, 10, 15)]);

    expect(planExportedMarks(steps, [mark(1, 2, 4)])).toEqual([]);
    expect(planExportedMarks(steps, [mark(1, 20, 24)])).toEqual([]);
  });

  it('clamps a mark that straddles a trim handle', () => {
    // The rule `planGoodBitsAfterTrim` already settled: cutting two seconds
    // off a five second mark leaves three seconds of the thing that was
    // marked. Two rules for one question is how a band ends up somewhere
    // nothing happens.
    const { steps } = buildRenderPlan([clip(1, 10, 15)]);

    expect(planExportedMarks(steps, [mark(1, 8, 12)])).toEqual([
      expect.objectContaining({ startSec: 0, endSec: 2 }),
    ]);
  });

  it('places a mark once per appearance, because it really is in the movie twice', () => {
    const { steps } = buildRenderPlan([clip(1, 0, 5), clip(2, 0, 5), clip(1, 0, 5)]);

    const out = planExportedMarks(steps, [mark(1, 1, 2)]);
    expect(out.map((entry) => entry.startSec)).toEqual([1, 11]);
  });

  it('refuses a sliver rather than writing a row the server would reject', () => {
    const { steps } = buildRenderPlan([clip(1, 10, 15)]);
    // 0.05s of it survives the handle.
    expect(planExportedMarks(steps, [mark(1, 9.9, 10.05)])).toEqual([]);
  });
});

describe('planExportedMarks, with a dissolve', () => {
  const timeline = [clip(1, 0, 5), clip(2, 0, 5)];
  const dissolve = [{ afterIndex: 0, type: 'crossDissolve' as const, durationSec: 1 }];

  it('is shorter than the sum of its clips, and the marks follow', () => {
    const plan = buildRenderPlan(timeline, dissolve);
    // Ten seconds of clips, one second of overlap, so nine.
    expect(plan.durationSec).toBe(9);

    // A mark at 4.0..4.5 on the second clip. Without the dissolve it would be
    // at 9.0; the blend has pulled the whole second clip a second earlier.
    const out = planExportedMarks(plan.steps, [mark(2, 4, 4.5)]);
    expect(out).toEqual([expect.objectContaining({ startSec: 8, endSec: 8.5 })]);

    const noDissolve = buildRenderPlan(timeline);
    expect(planExportedMarks(noDissolve.steps, [mark(2, 4, 4.5)])).toEqual([
      expect.objectContaining({ startSec: 9, endSec: 9.5 }),
    ]);
  });

  it('keeps a mark that falls inside the blend', () => {
    // During a blend both clips are genuinely on screen, so the moment is
    // visible; it is just visible through the other clip as well. Dropping it
    // would lose a mark for being in the most interesting second of the movie.
    const plan = buildRenderPlan(timeline, dissolve);
    // Clip 1's last second is the outgoing half of the blend, at output 4..5.
    const out = planExportedMarks(plan.steps, [mark(1, 4.2, 4.8)]);

    expect(out).toEqual([expect.objectContaining({ startSec: 4.2, endSec: 4.8 })]);
  });

  it('lays the blend over one output range, from both sides', () => {
    const plan = buildRenderPlan(timeline, dissolve);
    const layout = placements(plan.steps);

    const blend = layout.filter((entry) => entry.outStart === 4);
    expect(blend).toHaveLength(2);
    expect(blend.map((entry) => entry.clipId).sort()).toEqual([1, 2]);
  });
});

describe('what a carried mark says about itself', () => {
  it('keeps its own source rather than claiming to be manual', () => {
    // Nobody marked the export by hand, so `manual` would be a lie, and
    // nothing read its screen, so `hud` would be another.
    const { steps } = buildRenderPlan([clip(1, 0, 5)]);

    const [carried] = planExportedMarks(steps, [
      { ...mark(1, 1, 2), name: 'Triple', source: 'hud', reason: 'kill banner', confidence: 0.8 },
    ]);

    expect(carried.name).toBe('Triple');
    expect(carried.source).toBe('hud');
    expect(carried.reason).toBe('kill banner');
    expect(carried.confidence).toBe(0.8);
  });
});
