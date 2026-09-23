import { LEAD_IN, TAIL_ROOM } from '@shared/constants/suggestionWindow';
import { momentName } from '@shared/detectedGoodBits';
import { formatTimestamp } from './timestampParser';
import type { GoodBit, NewGoodBit } from '@renderer/types/goodbit';
import type { SuggestionEvent } from '@renderer/services/clips';

/**
 * What a GoodBit looks like on screen, and what a suggestion becomes if kept.
 *
 * Values in, values out, and nothing here touches the DOM, axios or a Pinia
 * store: `tests/unit/renderer/goodBits.spec.ts` covers it without a window. The
 * geometry in particular is worth having outside a component, because "where
 * does a range land on a strip" is arithmetic that either works at every clip
 * length or is wrong in a way only a screenshot would show.
 *
 * The range validation itself is not repeated here. `src/main/services/
 * goodBits.ts` owns it, the table carries a `CHECK` behind that, and a second
 * copy of the rules in the renderer is a second copy to disagree with. What is
 * here is what the server has no opinion about: how a range reads, whether two
 * of them collide, and where they sit in a box of pixels.
 */

/** A start and an end, which is all the geometry needs to know about a GoodBit. */
export interface Span {
  startSec: number;
  endSec: number;
}

/**
 * `0:04 – 0:11`, with an en dash.
 *
 * An en dash in a numeric range is correct typography and CLAUDE.md says so
 * explicitly, which is the only reason this is not a plain hyphen.
 *
 * `formatTimestamp` floors rather than rounds, and that is the behaviour
 * wanted: a label reading `0:30` on a range that ends at 29.9s points past the
 * last frame it holds.
 */
export function rangeLabel(startSec: number, endSec: number): string {
  return `${formatTimestamp(startSec)} – ${formatTimestamp(endSec)}`;
}

/**
 * How long a GoodBit is, in the words a person marking one thinks in.
 *
 * Tenths under ten seconds, because that is the range nearly every GoodBit
 * falls in (the measured events are 1 to 5 seconds) and the difference between
 * 4 and 4.5 seconds is a decision somebody is making with the handles. Whole
 * seconds above that, where a tenth is noise.
 */
export function durationLabel(seconds: number): string {
  const length = Math.max(0, seconds);
  return length < 10 ? `${Math.round(length * 10) / 10}s` : `${Math.round(length)}s`;
}

/**
 * What to call a GoodBit in a list.
 *
 * Its name, when it has one, and its range when it does not. A GoodBit with no
 * name is the normal case rather than an oversight: marking a range is the
 * point and naming it is extra, so the fallback has to be something worth
 * reading rather than "Untitled".
 */
export function goodBitLabel(goodBit: Pick<GoodBit, 'name' | 'startSec' | 'endSec'>): string {
  const named = (goodBit.name ?? '').trim();
  return named || rangeLabel(goodBit.startSec, goodBit.endSec);
}

/**
 * Whether two ranges share any time at all.
 *
 * Touching is not overlapping: a GoodBit ending at 4.0 and another starting at
 * 4.0 hold no frame in common, and marking the two halves of a fight as two
 * GoodBits is a thing somebody will do.
 */
export function overlaps(a: Span, b: Span): boolean {
  return a.startSec < b.endSec && b.startSec < a.endSec;
}

/**
 * Which of the existing GoodBits a range would sit on top of.
 *
 * **This is a warning and never a refusal.** The server allows an overlap on
 * purpose, and the obvious case is a thirty second firefight marked as one
 * GoodBit with the kill inside it marked as another. What it is for is telling
 * somebody who has just marked the same moment twice, which on a clip they have
 * come back to is easy to do and impossible to see.
 */
export function overlapping<T extends Span>(range: Span, existing: readonly T[]): T[] {
  return existing.filter((other) => overlaps(range, other));
}

/**
 * Whether a range is, within a rounding error, one already marked.
 *
 * `0.15` is the same tolerance `TrimPanel` uses to decide whether the handles
 * already sit on the suggested window, and it is there for the same reason: the
 * handles move in steps of a tenth and a range read back from the server has
 * been rounded to the millisecond, so an exact comparison never fires.
 */
export function sameRange(a: Span, b: Span, tolerance = 0.15): boolean {
  return (
    Math.abs(a.startSec - b.startSec) < tolerance && Math.abs(a.endSec - b.endSec) < tolerance
  );
}

/**
 * Which GoodBits a trim would leave pointing at nothing.
 *
 * **A trim rewrites the file and renumbers its timeline; a GoodBit is a pair of
 * numbers on that timeline.** Keeping 0 to 10 seconds of a thirty second
 * recording leaves a GoodBit marked at 20 to 25 outside the file altogether,
 * and one marked at 8 to 14 half in it. Neither is corrected, because
 * `TrimAndSwapClipAction` does not know this table exists: the rows survive the
 * cut unchanged and are then wrong.
 *
 * So this is what the trim button warns with. It is not a fix, it is the user
 * being told before they press rather than finding out afterwards, and the fix
 * belongs on the main side where the cut happens. Anything that ends up
 * partially inside counts: half a GoodBit is not the moment somebody marked.
 */
export function goodBitsLostToTrim<T extends Span>(
  goodBits: readonly T[],
  kept: Span,
): T[] {
  return goodBits.filter(
    (goodBit) => goodBit.startSec < kept.startSec || goodBit.endSec > kept.endSec,
  );
}

/**
 * Whether one of these GoodBits already holds a given moment.
 *
 * What "have I kept this one already" means for a detected reading. Comparing
 * the reading's derived range against the stored ones was the first answer and
 * it is the wrong one: the ranges stop matching the moment somebody nudges a
 * handle, and then the chip offers to keep a moment that is plainly already
 * marked. Containment survives that, and it is also what a person means.
 *
 * `reason` cannot be used for this, incidentally: a module writes the same
 * sentence for every reading of a kind, so two kills in one clip both read
 * "you dropped someone here".
 */
export function momentCovered(atSec: number, existing: readonly Span[]): boolean {
  return existing.some((span) => atSec >= span.startSec && atSec <= span.endSec);
}

/**
 * Where a range lands on a strip that runs the length of the clip.
 *
 * Percentages, not pixels, because the strip is whatever width the window gave
 * it and a percentage needs no measurement. Clamped at both ends: a GoodBit
 * whose end sits inside `END_SLACK_SEC` past the stored duration is legal
 * server-side (the container's header and a `<video>` disagree by a frame or
 * two), and without the clamp it would draw a band hanging off the edge.
 *
 * A zero or unknown duration gives a zero width band rather than a division by
 * zero: the strip is there before the duration has arrived.
 */
export function bandPosition(
  range: Span,
  durationSec: number,
): { leftPercent: number; widthPercent: number } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { leftPercent: 0, widthPercent: 0 };
  }

  const clamp = (value: number): number => Math.max(0, Math.min(100, value));
  const left = clamp((range.startSec / durationSec) * 100);
  const right = clamp((range.endSec / durationSec) * 100);

  return { leftPercent: left, widthPercent: Math.max(0, right - left) };
}

/**
 * How many rows of bands a timeline will draw before it stops adding rows.
 *
 * Three, over a 128 pixel strip: at six pixels a row that is eighteen pixels of
 * the picture given up to markers, which is about as much as a strip somebody
 * is reading frames off can spare. A fourth GoodBit overlapping the first three
 * shares a row with whichever of them ended earliest, which is a drawing
 * compromise and not a limit on how many a clip may hold.
 */
export const MAX_BAND_LANES = 3;

/**
 * Stack overlapping ranges into rows so none of them is drawn under another.
 *
 * Greedy and in clip order, which is the order the list arrives in: a range
 * goes in the first row whose last band has already finished, so ranges that do
 * not overlap all share row zero and only a genuine collision costs height.
 *
 * When every row is still busy the range joins the row that frees up soonest.
 * That is a deliberate overlap rather than a fourth row: the alternative is a
 * strip whose markers grow without bound, and by the time four GoodBits overlap
 * at one instant the list below is the thing to read.
 */
export function assignLanes<T extends Span>(
  ranges: readonly T[],
  maxLanes = MAX_BAND_LANES,
): Array<{ range: T; lane: number }> {
  const lanes = Math.max(1, maxLanes);
  /** Where each row's last band ended, so far. `-Infinity` is an empty row. */
  const endOfLane: number[] = new Array(lanes).fill(Number.NEGATIVE_INFINITY);

  return [...ranges]
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec)
    .map((range) => {
      let chosen = endOfLane.findIndex((end) => end <= range.startSec);

      if (chosen === -1) {
        // Every row is still busy. The one that frees up soonest overlaps least.
        chosen = endOfLane.reduce(
          (best, end, index) => (end < endOfLane[best] ? index : best),
          0,
        );
      }

      endOfLane[chosen] = Math.max(endOfLane[chosen], range.endSec);
      return { range, lane: chosen };
    });
}

/**
 * The narrowest mark worth drawing on a library card, in pixels.
 *
 * A GoodBit is often a second or two of a thirty second recording, which on a
 * three hundred pixel card is twenty pixels, and the floor of 0.1 seconds is
 * one. Below three pixels a mark reads as a rendering artefact rather than as
 * something somebody put there, so a short one is widened rather than drawn
 * faithfully and invisibly. It stops being a measurement at that point, which
 * is the trade: the card says *there are good bits and roughly where*, and the
 * timeline is where a range is actually read.
 */
/**
 * Where a mark sits on a timeline block, which shows a window of its clip.
 *
 * `bandPosition` maps a range against the whole recording, which is what a
 * library card shows. A timeline block shows `trimStart..trimEnd` of the same
 * source, so the same mark belongs at a different place on it, and at a
 * different width: a five second mark on a thirty second recording is a sixth
 * of a card and the whole of a block trimmed to those five seconds.
 *
 * **A mark that straddles a handle is kept and clamped**, not dropped. That is
 * the rule `services/goodBitsAfterTrim.ts` already settled for the trimmer:
 * cutting two seconds off a five second mark leaves three seconds of the thing
 * that was marked, and dropping it throws away a decision over an edge the
 * person dragging the handle can see. A second rule here that disagreed with
 * the trimmer's would be two answers to one question.
 *
 * Returns null for a mark with no footage left inside the window, so a caller
 * draws nothing rather than a zero-width band at one end.
 */
export function markOnTrimmedBlock(
  range: Span,
  trimStart: number,
  trimEnd: number,
): { leftPercent: number; widthPercent: number } | null {
  const window = trimEnd - trimStart;
  if (!Number.isFinite(window) || window <= 0) return null;

  const start = Math.max(range.startSec, trimStart);
  const end = Math.min(range.endSec, trimEnd);
  // `<=` rather than `<`: a mark that only touches a handle shares no footage
  // with what the block is showing.
  if (end <= start) return null;

  const clamp = (value: number): number => Math.max(0, Math.min(100, value));
  const left = clamp(((start - trimStart) / window) * 100);
  const right = clamp(((end - trimStart) / window) * 100);

  return { leftPercent: left, widthPercent: Math.max(0, right - left) };
}

export const MIN_PIP_PX = 3;

/**
 * How many marks a card draws before it gives up and counts them instead.
 *
 * Measured against the geometry rather than chosen: at four marks on a card
 * 280 pixels wide, each at least three pixels and separated by at least two,
 * the marks occupy twenty pixels of a two hundred and eighty pixel line and
 * stay individually countable at a glance. At six they read as a dashed line,
 * and a dashed line says nothing a number does not say better.
 */
export const MAX_CARD_PIPS = 4;

export type PipLayout =
  | { kind: 'pips'; pips: Array<{ leftPercent: number; widthPercent: number }> }
  | { kind: 'count'; count: number };

/**
 * What a library card draws for a clip's GoodBits.
 *
 * Either the marks themselves or how many there are, and the decision is made
 * here rather than in the template so the threshold is one number in one place
 * with a test on it.
 *
 * `widthPx` is the card's own width, which a component measures. It is a
 * parameter rather than a constant because the library's grid is responsive and
 * a card on a 21:9 screen is not the width of a card on a laptop, and the
 * minimum pip is in pixels while everything drawn is in percentages.
 */
export function pipLayout(
  ranges: readonly Span[],
  durationSec: number,
  widthPx: number,
  maxPips = MAX_CARD_PIPS,
): PipLayout {
  if (ranges.length === 0) return { kind: 'pips', pips: [] };
  if (ranges.length > maxPips) return { kind: 'count', count: ranges.length };

  // With no measured width there is nothing to compare a minimum in pixels
  // against, so the bands are drawn at their true size. Better a faithful mark
  // on the first frame than none until a resize observer has fired.
  const minPercent = widthPx > 0 ? (MIN_PIP_PX / widthPx) * 100 : 0;

  const pips = [...ranges]
    .sort((a, b) => a.startSec - b.startSec)
    .map((range) => {
      const { leftPercent, widthPercent } = bandPosition(range, durationSec);
      if (widthPercent >= minPercent) return { leftPercent, widthPercent };

      /*
       * Too short to see, so it is widened about its own middle and then
       * pushed back inside the card. Growing it only to the right would walk
       * a GoodBit at the very end of a clip off the edge, and clamping the
       * left alone would move a mark at 0:00 away from where it happened.
       */
      const middle = leftPercent + widthPercent / 2;
      const left = Math.max(0, Math.min(100 - minPercent, middle - minPercent / 2));
      return { leftPercent: left, widthPercent: minPercent };
    });

  return { kind: 'pips', pips };
}

/**
 * The marked ranges a library card can draw, if it has been told any.
 *
 * **Nothing tells it any yet, and that is the honest state of the card.**
 * `ClipDTO` carries no GoodBits: not the rows, not a count. The only way to ask
 * is `GET /clips/:id/goodbits`, which is per clip, and the library paginates at
 * fifty and then scrolls, so drawing pips from that means one request per tile
 * growing without bound. This project has been here before with thumbnails, and
 * `mediaQueue` exists because of it.
 *
 * So the card reads the ranges off the clip if they are there, and draws
 * nothing when they are not. The cast is in this one function rather than
 * spread through a template. `ClipDTO` carries the array now: the list routes
 * attach it with one query for the page, so a card reads what it was given
 * rather than asking per tile.
 */
export function clipGoodBitRanges(clip: unknown): Span[] {
  const carried = (clip as { goodBits?: unknown } | null)?.goodBits;
  if (!Array.isArray(carried)) return [];

  return carried.filter(
    (span): span is Span =>
      typeof (span as Span)?.startSec === 'number' && typeof (span as Span)?.endSec === 'number',
  );
}

/*
 * The window around a detected reading, from `@shared`.
 *
 * These were restated here as `2.5` and `1.5` with a comment saying they match
 * `AnalyzeClipAction`, because they lived in main and the renderer cannot
 * import from there. A comment is not a constraint: two copies of a measured
 * number drift the first time somebody retunes one, and nothing fails when
 * they do. They are one declaration now.
 */
export const ANCHOR_LEAD_SEC = LEAD_IN;
export const ANCHOR_TAIL_SEC = TAIL_ROOM;

/**
 * What a detected moment becomes when somebody presses keep.
 *
 * Main now writes every confident reading down as a GoodBit by itself
 * (`services/detectedGoodBits.ts`), tight around the instant. This is the
 * press for the rest: a reading somebody deleted and wants back, and the
 * banner's own wider window. It carries the reading's own `reason` and
 * `confidence` so the sentence shown next to it later is the one the rule
 * wrote at the time.
 *
 * `preferred` is the window the server already placed around the strongest
 * reading, which only `anchors[0]` has. Using it where it exists keeps the chip
 * and the banner's *Use it* from disagreeing about the same moment by a second.
 * Every other anchor gets the lead-in and the tail and nothing else: the six
 * second floor `MIN_WINDOW_SEC` puts under a *suggested trim* is there so a cut
 * does not read as a jump cut, and a GoodBit is a mark with two handles on it
 * that can be widened in a second.
 */
export function anchorToGoodBit(
  anchor: SuggestionEvent,
  durationSec: number,
  preferred?: { start: number; end: number } | null,
): NewGoodBit {
  const length = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;
  const cap = (value: number): number => (length === null ? Math.max(0, value) : Math.max(0, Math.min(value, length)));

  const raw = preferred
    ? { startSec: preferred.start, endSec: preferred.end }
    : {
        startSec: anchor.atSec - ANCHOR_LEAD_SEC,
        endSec: (anchor.untilSec ?? anchor.atSec) + ANCHOR_TAIL_SEC,
      };

  const startSec = round(cap(raw.startSec));
  const endSec = round(cap(raw.endSec));

  return {
    startSec,
    // A reading at the very end of a clip can be clamped to the same instant
    // at both ends, which the server refuses as shorter than a frame. Backing
    // the start off keeps a range that means something.
    endSec: endSec > startSec ? endSec : round(cap(startSec + ANCHOR_TAIL_SEC)),
    name: anchorName(anchor),
    source: 'hud',
    reason: anchor.reason,
    confidence: anchor.confidence,
  };
}

/**
 * What to call a kept reading.
 *
 * The `kind` a module stamped on the event, as a word rather than an
 * identifier: `kill` reads as "Kill" in a list, and the `reason` underneath it
 * is the full sentence. The reason itself would be too long for a name, and a
 * name is what goes on the file if the GoodBit is ever rendered out.
 *
 * Exported because the chips that offer to keep a reading show the same word.
 * A chip that says `Down` and then writes a mark called something else is two
 * names for one thing, arrived at separately.
 */
export function anchorName(anchor: SuggestionEvent): string | null {
  return momentName(anchor.kind);
}

/** To the tenth, which is the step the handles move in. */
function round(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}
