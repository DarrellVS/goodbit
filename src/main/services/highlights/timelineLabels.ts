import { labelKind, type TrimLabel } from './labels.js';

/**
 * What a montage says about the suggestions the app made.
 *
 * **Nothing in the editor wrote a label before this.** Traced end to end: the
 * handle drag emits `trim`, `useTimeline.trimClip` mutates two numbers in
 * memory, and the export posts to `/api/clips/export` and reaches an action
 * that never imports `labels.ts`. The only two writers to `highlight_label`
 * were `TrimAndSwapClipAction` and the reject route, both on the Trim page.
 *
 * Which meant `trimAllToHighlights()`, which is literally a bulk accept-or-
 * correct of the app's own suggestions, was invisible to the model that made
 * them. That is the most valuable missing signal in the app.
 *
 * **The label is written on export, not on drag**, and that is the design
 * question rather than a detail. A Trim page cut is destructive and final: the
 * file is replaced and the range is the person's verdict on that recording. A
 * timeline trim is provisional. It is dragged, undone, redone, nudged, and the
 * clip may be pulled off the timeline entirely before anything is rendered. A
 * label per drag would write dozens of contradictory rows per clip and drown
 * the honest ones.
 *
 * At the moment a timeline is exported, though, the in and out points are the
 * person's final answer for that clip in that montage. One label per clip per
 * export, which has two consequences and both are right:
 *
 * - A clip that appears twice on one timeline produces two labels. Two
 *   deliberate ranges were chosen.
 * - A clip trimmed and then removed before export produces none. That was not
 *   a decision, it was an experiment.
 */

export interface TimelineTrim {
  clipId: number;
  game: string;
  trimStart: number;
  trimEnd: number;
}

/** The half of a `SuggestionResult` a label is made of. */
export interface SuggestionFacts {
  durationSec: number;
  confident: boolean;
  /** Null when the analysis found nothing worth pointing at. */
  window: { start: number; end: number } | null;
  peakZ?: number | null;
  spreadLu?: number | null;
  eventSec?: number | null;
}

/**
 * One label per clip on the timeline, in timeline order.
 *
 * Pure, so `tests/unit` owns the classification without a database or a GPU.
 * A clip with no suggestion still produces a label, with `suggested: null`:
 * "somebody cut here and we had nothing to offer" is as useful to the model as
 * a correction, and it is the majority case on a library where 76 of 174 clips
 * hold nothing the screen can name.
 */
export function planTimelineLabels(
  trims: readonly TimelineTrim[],
  suggestions: ReadonlyMap<number, SuggestionFacts | null>,
): TrimLabel[] {
  return trims.map((trim) => {
    const facts = suggestions.get(trim.clipId) ?? null;

    return {
      clipId: trim.clipId,
      game: trim.game,
      // The clip's own length when it is known. Falling back to the chosen end
      // is what `TrimAndSwapClipAction` does, and it is the closest thing
      // available: a range cannot end after the recording does.
      durationSec: facts?.durationSec ?? trim.trimEnd,
      chosenStartSec: trim.trimStart,
      chosenEndSec: trim.trimEnd,
      // Only a confident suggestion counts as one having been made. An
      // unconfident window is the analysis saying it does not know, and
      // recording it as an offer the person declined would teach the model
      // that its own shrug was wrong.
      suggested: facts?.confident ? (facts.window ?? null) : null,
      peakZ: facts?.peakZ ?? null,
      spreadLu: facts?.spreadLu ?? null,
      eventSec: facts?.eventSec ?? null,
    };
  });
}

/** What each planned label will be filed as. For assertions and for logging. */
export function summariseLabels(labels: readonly TrimLabel[]): {
  accepted: number;
  trim: number;
} {
  let accepted = 0;
  for (const label of labels) if (labelKind(label) === 'accepted') accepted += 1;
  return { accepted, trim: labels.length - accepted };
}
