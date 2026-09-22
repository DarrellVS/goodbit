import type { RenderStep } from './exportPlan.js';

/**
 * Where a clip's marks end up on the movie cut out of it.
 *
 * A GoodBit says where the good part of a recording is, and an export is
 * usually made *out of* the good parts. Losing the marks in the process means
 * the finished montage is the one clip in the library that cannot say where
 * anything in it happens, which is backwards.
 *
 * **Computed here, in main, from the render plan.** Not sent by the renderer:
 * the offsets depend on how the plan actually laid the segments out, and a
 * second implementation in the window would be two answers to one question,
 * which is exactly why `planAudioTracks` was moved to `src/shared`. The
 * renderer sends clip ids and trims; this reads what the plan made of them.
 *
 * **A dissolve shortens the movie**, and that is the whole reason this is not
 * `(mark - trimStart) + clipStartTime`. `buildRenderPlan` takes the overlap
 * out of *both* neighbours, so a clip with a transition on each side gives up
 * the sum and every mark after it slides. Getting that wrong is invisible in
 * the usual way: the band still draws, over a moment where nothing happens.
 */

export interface SourceMark {
  clipId: number;
  startSec: number;
  endSec: number;
  /** Carried through so the export's marks say where they came from. */
  name?: string | null;
  source?: string | null;
  reason?: string | null;
  confidence?: number | null;
}

export interface ExportedMark {
  startSec: number;
  endSec: number;
  name?: string | null;
  source?: string | null;
  reason?: string | null;
  confidence?: number | null;
}

/** One stretch of one clip, and where it landed in the output. */
interface Placement {
  clipId: number;
  sourceStart: number;
  sourceEnd: number;
  outStart: number;
}

/**
 * Too short to be the moment somebody marked.
 *
 * The same floor `goodBitsAfterTrim` uses, and for the same reason: a mark
 * clipped to a twentieth of a second is the edge of a moment rather than the
 * moment, and the server would refuse to create a row that short anyway.
 */
const MIN_SURVIVING_SEC = 0.1;

/**
 * Read the plan back as a list of "this bit of this clip landed there".
 *
 * A `cut` contributes one stretch. A `dissolve` contributes two that land on
 * the *same* output range, one from each side, because during a blend both
 * clips are genuinely on screen. A mark inside a blend is therefore kept
 * rather than dropped, which is the honest answer: the moment is visible, it
 * is just visible through the other clip as well.
 */
export function placements(steps: readonly RenderStep[]): Placement[] {
  const out: Placement[] = [];
  let offset = 0;

  for (const step of steps) {
    if (step.kind === 'cut') {
      out.push({
        clipId: step.source.clipId,
        sourceStart: step.source.startSec,
        sourceEnd: step.source.startSec + step.durationSec,
        outStart: offset,
      });
    } else {
      out.push({
        clipId: step.from.clipId,
        sourceStart: step.from.startSec,
        sourceEnd: step.from.startSec + step.durationSec,
        outStart: offset,
      });
      out.push({
        clipId: step.to.clipId,
        sourceStart: step.to.startSec,
        sourceEnd: step.to.startSec + step.durationSec,
        outStart: offset,
      });
    }

    offset = round(offset + step.durationSec);
  }

  return out;
}

/**
 * Every mark that survives, at its position in the finished movie.
 *
 * A clip can appear more than once on a timeline, and a mark on it then
 * appears once per appearance, which is right: the moment really is in the
 * movie twice.
 *
 * A mark straddling a segment boundary is clamped rather than dropped, the
 * same rule `planGoodBitsAfterTrim` settled for the trimmer. Two rules for one
 * question is how a band ends up somewhere nothing happens.
 */
export function planExportedMarks(
  steps: readonly RenderStep[],
  marks: readonly SourceMark[],
): ExportedMark[] {
  if (!steps.length || !marks.length) return [];

  const layout = placements(steps);
  const out: ExportedMark[] = [];

  for (const placement of layout) {
    for (const mark of marks) {
      if (mark.clipId !== placement.clipId) continue;

      const start = Math.max(mark.startSec, placement.sourceStart);
      const end = Math.min(mark.endSec, placement.sourceEnd);
      if (end - start < MIN_SURVIVING_SEC) continue;

      out.push({
        startSec: round(placement.outStart + (start - placement.sourceStart)),
        endSec: round(placement.outStart + (end - placement.sourceStart)),
        name: mark.name ?? null,
        // Carried rather than rewritten. Nobody marked the export by hand, so
        // `manual` would be a lie; nothing read its screen, so `hud` would be
        // another. Saying where it came from keeps the "4% of a real library
        // holds two or more" statistics meaning what they meant.
        source: mark.source ?? null,
        reason: mark.reason ?? null,
        confidence: mark.confidence ?? null,
      });
    }
  }

  out.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  return out;
}

/** Three decimals, which is what the column and the UI both use. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
