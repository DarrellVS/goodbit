import { describe, expect, it } from 'vitest';
import {
  ANCHOR_LEAD_SEC,
  ANCHOR_TAIL_SEC,
  MAX_BAND_LANES,
  MAX_CARD_PIPS,
  MIN_PIP_PX,
  anchorToGoodBit,
  assignLanes,
  bandPosition,
  clipGoodBitRanges,
  durationLabel,
  goodBitLabel,
  goodBitsLostToTrim,
  momentCovered,
  overlapping,
  overlaps,
  pipLayout,
  rangeLabel,
  sameRange,
  type Span,
} from '../../../src/renderer/src/utils/goodBits';
import { formatEta } from '../../../src/renderer/src/services/jobs';
import type { SuggestionEvent } from '../../../src/renderer/src/services/clips';

/**
 * What a GoodBit reads as, and where it lands on a strip.
 *
 * The range *validation* is main's and is covered by
 * `tests/unit/main/goodBits.spec.ts`. What is here is the half that only the
 * window has an opinion about: how a range is written down for a person, which
 * ranges collide, and the arithmetic that turns a start and an end into a box
 * of pixels. That last one is the reason this file exists rather than being
 * checked by looking at the app: a band that is one pixel wide on a short
 * GoodBit and a band drawn off the right-hand edge look identical to a
 * screenshot of a card that has neither.
 */

const span = (startSec: number, endSec: number): Span => ({ startSec, endSec });

describe('how a GoodBit reads', () => {
  it('writes a range with an en dash, floored to the second', () => {
    // An en dash in a numeric range is correct typography and is the one dash
    // CLAUDE.md allows. Flooring matters: `0:30` on a range ending at 29.9
    // points past the last frame it holds.
    expect(rangeLabel(4, 11)).toBe('0:04 – 0:11');
    expect(rangeLabel(4.9, 29.9)).toBe('0:04 – 0:29');
    expect(rangeLabel(0, 3661)).toBe('0:00 – 1:01:01');
  });

  it('gives tenths to a short GoodBit and whole seconds to a long one', () => {
    // Nearly every GoodBit is short, the measured events run 1 to 5 seconds,
    // and there the difference between 4 and 4.5 is a decision somebody is
    // making with a handle. Above ten seconds a tenth is noise.
    expect(durationLabel(1.45)).toBe('1.5s');
    expect(durationLabel(4)).toBe('4s');
    expect(durationLabel(9.94)).toBe('9.9s');
    expect(durationLabel(23.4)).toBe('23s');
    // A negative length is not a thing, but a subtraction can produce one.
    expect(durationLabel(-2)).toBe('0s');
  });

  it('falls back to the range when nothing named it', () => {
    // A nameless GoodBit is the normal case rather than an oversight, so the
    // fallback has to say something worth reading. "Untitled" does not.
    expect(goodBitLabel({ name: 'the tank', startSec: 3.5, endSec: 5 })).toBe('the tank');
    expect(goodBitLabel({ name: null, startSec: 3.5, endSec: 5 })).toBe('0:03 – 0:05');
    expect(goodBitLabel({ name: '   ', startSec: 65, endSec: 70 })).toBe('1:05 – 1:10');
  });
});

describe('which ranges collide', () => {
  it('counts a shared instant and not a shared edge', () => {
    expect(overlaps(span(0, 5), span(4, 9))).toBe(true);
    expect(overlaps(span(4, 9), span(0, 5))).toBe(true);
    // Marking the two halves of a fight as two GoodBits holds no frame in
    // common, and it is a thing somebody will do.
    expect(overlaps(span(0, 4), span(4, 9))).toBe(false);
    expect(overlaps(span(0, 4), span(9, 12))).toBe(false);
    // Wholly inside: a thirty second firefight and the kill in the middle of it.
    expect(overlaps(span(0, 30), span(12, 14))).toBe(true);
  });

  it('names every existing GoodBit a new range would sit on', () => {
    const existing = [span(0, 4), span(3, 9), span(20, 25)];
    expect(overlapping(span(3.5, 3.6), existing)).toEqual([span(0, 4), span(3, 9)]);
    expect(overlapping(span(10, 19), existing)).toEqual([]);
  });

  it('treats a range as the same one within the tolerance a handle moves in', () => {
    // The handles step by a tenth and a stored range has been rounded to the
    // millisecond, so an exact comparison would never fire.
    expect(sameRange(span(4.5, 12.8), span(4.5, 12.8))).toBe(true);
    expect(sameRange(span(4.5, 12.8), span(4.6, 12.7))).toBe(true);
    expect(sameRange(span(4.5, 12.8), span(4.8, 12.8))).toBe(false);
    // A tighter tolerance is what decides whether an edit is dirty.
    expect(sameRange(span(4.5, 12.8), span(4.6, 12.8), 0.05)).toBe(false);
  });

  it('knows whether a moment is already inside something marked', () => {
    const marked = [span(2, 6), span(20, 25)];
    expect(momentCovered(4, marked)).toBe(true);
    // Inclusive at both edges: a reading exactly on the end of a GoodBit is
    // the thing that GoodBit was kept for.
    expect(momentCovered(6, marked)).toBe(true);
    expect(momentCovered(2, marked)).toBe(true);
    expect(momentCovered(10, marked)).toBe(false);
    expect(momentCovered(4, [])).toBe(false);
  });
});

describe('what a trim would do to the marks on a clip', () => {
  /*
   * A trim rewrites the file and renumbers the timeline the marks are written
   * against, and nothing corrects them: `TrimAndSwapClipAction` does not know
   * this table exists. These are the rows the trim button has to warn about.
   */
  const marks = [span(0.5, 2), span(8, 14), span(20, 25)];

  it('names the marks that would fall outside the cut', () => {
    // Keeping the first ten seconds orphans the one at 20 outright and leaves
    // the one at 8 to 14 half in the file.
    expect(goodBitsLostToTrim(marks, span(0, 10))).toEqual([span(8, 14), span(20, 25)]);
  });

  it('says nothing when the cut holds every mark', () => {
    expect(goodBitsLostToTrim(marks, span(0, 30))).toEqual([]);
    expect(goodBitsLostToTrim(marks, span(0.5, 25))).toEqual([]);
    expect(goodBitsLostToTrim([], span(0, 10))).toEqual([]);
  });

  it('counts a mark that is only partly inside as lost', () => {
    // Half a GoodBit is not the moment somebody marked.
    expect(goodBitsLostToTrim([span(8, 14)], span(9, 20))).toEqual([span(8, 14)]);
    expect(goodBitsLostToTrim([span(8, 14)], span(0, 13))).toEqual([span(8, 14)]);
  });
});

describe('where a range lands on a strip', () => {
  it('turns seconds into percentages of the clip', () => {
    expect(bandPosition(span(0, 15), 30)).toEqual({ leftPercent: 0, widthPercent: 50 });
    expect(bandPosition(span(3, 6), 30)).toEqual({ leftPercent: 10, widthPercent: 10 });
    expect(bandPosition(span(27, 30), 30)).toEqual({ leftPercent: 90, widthPercent: 10 });
  });

  it('clamps an end that sits past the stored duration', () => {
    /*
     * A GoodBit may legally end up to `END_SLACK_SEC` past `Clip.durationSec`:
     * the container's header and a `<video>` element disagree by a frame or two
     * on these recordings, so the server clamps rather than refusing. Without
     * the clamp here the band is drawn hanging off the right-hand edge.
     */
    const clamped = bandPosition(span(29, 30.4), 30);
    expect(clamped.leftPercent).toBeCloseTo((29 / 30) * 100, 10);
    // The right edge lands on 100 rather than 101.33, so the band ends with the
    // strip instead of past it.
    expect(clamped.leftPercent + clamped.widthPercent).toBeCloseTo(100, 10);

    // Entirely past the end, which should be nothing rather than a negative
    // width in a style attribute.
    expect(bandPosition(span(31, 32), 30)).toEqual({ leftPercent: 100, widthPercent: 0 });
  });

  it('draws nothing at all before the duration has arrived', () => {
    // The strip exists before the probe answers, and a division by zero would
    // be an `Infinity%` in a style attribute.
    expect(bandPosition(span(3, 6), 0)).toEqual({ leftPercent: 0, widthPercent: 0 });
    expect(bandPosition(span(3, 6), Number.NaN)).toEqual({ leftPercent: 0, widthPercent: 0 });
  });
});

describe('stacking bands so none hides another', () => {
  it('keeps ranges that never overlap in one row', () => {
    const placed = assignLanes([span(0, 4), span(8, 12), span(20, 25)]);
    expect(placed.map((item) => item.lane)).toEqual([0, 0, 0]);
  });

  it('lifts an overlapping range into the next row', () => {
    // The case the measurement found: a long moment with a short one inside it.
    const placed = assignLanes([span(0, 30), span(12, 14)]);
    expect(placed.map((item) => item.lane)).toEqual([0, 1]);
  });

  it('sorts into clip order before placing, whatever order it was given', () => {
    // The list arrives in clip order from the server, but a locally inserted
    // row is pushed and sorted, and a caller could hand over anything.
    const placed = assignLanes([span(12, 14), span(0, 30)]);
    expect(placed.map((item) => item.range.startSec)).toEqual([0, 12]);
    expect(placed.map((item) => item.lane)).toEqual([0, 1]);
  });

  it('stops adding rows and overlaps the one that frees up soonest', () => {
    /*
     * Four ranges all live at once. Three rows is eighteen pixels of a 128
     * pixel strip, which is about as much of the picture as a strip somebody is
     * reading frames off can spare, so the fourth shares rather than growing a
     * row. It goes in the row whose band ends earliest, which overlaps least.
     */
    const placed = assignLanes([span(0, 30), span(1, 10), span(2, 29), span(3, 28)]);
    expect(placed.map((item) => item.lane)).toEqual([0, 1, 2, 1]);
    expect(Math.max(...placed.map((item) => item.lane))).toBeLessThan(MAX_BAND_LANES);
  });

  it('reuses a row as soon as its band has finished', () => {
    const placed = assignLanes([span(0, 5), span(2, 7), span(6, 9)]);
    // The third starts after the first ended, so row zero is free again.
    expect(placed.map((item) => item.lane)).toEqual([0, 1, 0]);
  });
});

describe('what a library card draws', () => {
  /** About the width of a card in the library's grid on a laptop. */
  const CARD_PX = 300;

  it('draws nothing for a clip with nothing marked', () => {
    expect(pipLayout([], 30, CARD_PX)).toEqual({ kind: 'pips', pips: [] });
  });

  it('draws a band whose width is the GoodBit’s own length', () => {
    // Two seconds of a thirty second recording is twenty pixels of a 300 pixel
    // card: visible, countable, and proportionate. That is the whole argument
    // for a band rather than a dot at the start.
    const layout = pipLayout([span(6, 8)], 30, CARD_PX);
    expect(layout.kind).toBe('pips');
    expect(layout.kind === 'pips' && layout.pips).toHaveLength(1);
    // `toBeCloseTo`, because the width is one percentage subtracted from
    // another: 26.666666666666668 less 20 is not 6.666666666666667.
    expect(layout.kind === 'pips' && layout.pips[0].leftPercent).toBeCloseTo(20, 10);
    expect(layout.kind === 'pips' && layout.pips[0].widthPercent).toBeCloseTo(100 / 15, 10);
  });

  it('widens a GoodBit too short to see, about its own middle', () => {
    /*
     * The floor is 0.1 seconds, which on a thirty second clip at 300 pixels is
     * one pixel: a rendering artefact rather than something somebody put there.
     * It is widened to `MIN_PIP_PX` and centred on where it actually is, which
     * is the point at which the card stops being a measurement and becomes a
     * hint. The timeline is where a range is read.
     */
    const layout = pipLayout([span(15, 15.1)], 30, CARD_PX);
    const expected = (MIN_PIP_PX / CARD_PX) * 100;
    expect(layout.kind === 'pips' && layout.pips[0].widthPercent).toBeCloseTo(expected, 10);
    // Centred on 50.17%, so the left edge sits half a pip before it.
    expect(layout.kind === 'pips' && layout.pips[0].leftPercent).toBeCloseTo(
      50 + (0.05 / 30) * 100 - expected / 2,
      10,
    );
  });

  it('keeps a widened band inside the card at either end', () => {
    // Growing it only rightwards would walk a GoodBit at the very end of a clip
    // off the edge; clamping only the left would move one at 0:00 away from
    // where it happened.
    const expected = (MIN_PIP_PX / CARD_PX) * 100;

    const atStart = pipLayout([span(0, 0.1)], 30, CARD_PX);
    expect(atStart.kind === 'pips' && atStart.pips[0].leftPercent).toBe(0);

    const atEnd = pipLayout([span(29.9, 30)], 30, CARD_PX);
    expect(atEnd.kind === 'pips' && atEnd.pips[0].leftPercent).toBeCloseTo(100 - expected, 10);
  });

  it('draws bands in clip order however the list arrived', () => {
    const layout = pipLayout([span(20, 22), span(2, 4)], 30, CARD_PX);
    expect(layout.kind === 'pips' && layout.pips.map((pip) => pip.leftPercent)).toEqual([
      (2 / 30) * 100,
      (20 / 30) * 100,
    ]);
  });

  it('draws bands up to four and counts them after that', () => {
    /*
     * The threshold the prototype landed on. Four bands on a 300 pixel card are
     * countable at a glance; six read as a dashed line, and a dashed line says
     * less than the number six does.
     */
    const four = [span(1, 3), span(6, 8), span(12, 14), span(20, 22)];
    expect(pipLayout(four, 30, CARD_PX).kind).toBe('pips');
    expect(pipLayout([...four, span(25, 27)], 30, CARD_PX)).toEqual({ kind: 'count', count: 5 });
    expect(MAX_CARD_PIPS).toBe(4);
  });

  it('draws at true size before the card has been measured', () => {
    // Zero width means the observer has not fired yet. A faithful band on the
    // first frame beats nothing until a resize.
    const layout = pipLayout([span(15, 15.1)], 30, 0);
    expect(layout.kind === 'pips' && layout.pips[0].widthPercent).toBeCloseTo((0.1 / 30) * 100, 10);
  });
});

describe('what the card can actually be told', () => {
  /*
   * Nothing, today. `ClipDTO` carries no GoodBits, so this reads an absent
   * field on every clip in the library and the marker layer draws nothing. The
   * test is here so that the day the list query selects them, the field name
   * and the shape it has to arrive in are already written down.
   */
  it('finds nothing on a clip row as it arrives today', () => {
    expect(clipGoodBitRanges({ id: 1, filename: 'a.mp4' })).toEqual([]);
    expect(clipGoodBitRanges(null)).toEqual([]);
    expect(clipGoodBitRanges(undefined)).toEqual([]);
  });

  it('reads the ranges when they are carried, and ignores anything malformed', () => {
    expect(
      clipGoodBitRanges({
        goodBits: [
          { id: 1, startSec: 2, endSec: 6 },
          { id: 2, startSec: null, endSec: 6 },
          { id: 3, endSec: 6 },
        ],
      }),
    ).toEqual([{ id: 1, startSec: 2, endSec: 6 }]);

    // A field of the wrong type entirely, which a hand-built object could be.
    expect(clipGoodBitRanges({ goodBits: 3 })).toEqual([]);
  });
});

describe('what a detected moment becomes when it is kept', () => {
  const anchor = (over: Partial<SuggestionEvent> = {}): SuggestionEvent => ({
    kind: 'kill',
    atSec: 12,
    confidence: 0.94,
    reason: 'you dropped someone here',
    ...over,
  });

  it('opens before the moment and closes after it', () => {
    /*
     * What a detector marks is the *reaction*: the kill banner, the spike. The
     * shot that caused it already happened, so opening on the banner keeps the
     * aftermath and drops the thing. Same numbers as `AnalyzeClipAction`.
     */
    expect(anchorToGoodBit(anchor(), 30)).toEqual({
      startSec: 12 - ANCHOR_LEAD_SEC,
      endSec: 12 + ANCHOR_TAIL_SEC,
      name: 'Kill',
      source: 'hud',
      reason: 'you dropped someone here',
      confidence: 0.94,
    });
  });

  it('runs to the end of the reading when the module gave one', () => {
    // A burst the module merged: `untilSec` is when it stopped, not when it
    // started, and the tail goes after that rather than after the first hit.
    const kept = anchorToGoodBit(anchor({ atSec: 12, untilSec: 16, kind: 'multi-kill' }), 30);
    expect(kept.startSec).toBe(9.5);
    expect(kept.endSec).toBe(17.5);
    expect(kept.name).toBe('Multi kill');
  });

  it('keeps a reading at the very start of the clip inside the clip', () => {
    /*
     * Three of the seven multi-event clips in the measurement had a reading at
     * exactly 0.0s: a kill banner already on screen when the buffer started.
     * Without the clamp that is a GoodBit starting at minus two and a half
     * seconds, which the server refuses.
     */
    expect(anchorToGoodBit(anchor({ atSec: 0 }), 30)).toMatchObject({
      startSec: 0,
      endSec: ANCHOR_TAIL_SEC,
    });
  });

  it('keeps a reading at the very end of the clip from collapsing to nothing', () => {
    // Clamped at both ends this would be 30 to 30, which is shorter than a
    // frame and refused. The start backs off instead.
    const kept = anchorToGoodBit(anchor({ atSec: 30 }), 30);
    expect(kept.startSec).toBe(27.5);
    expect(kept.endSec).toBe(30);
    expect(kept.endSec).toBeGreaterThan(kept.startSec);
  });

  it('uses the window the server already placed, for the strongest reading', () => {
    /*
     * Only `anchors[0]` has one. Using it where it exists is what keeps this
     * chip and the banner's *Use it* from disagreeing about the same moment by
     * a second and a half.
     */
    expect(anchorToGoodBit(anchor(), 30, { start: 6.4, end: 16.4 })).toMatchObject({
      startSec: 6.4,
      endSec: 16.4,
      source: 'hud',
    });
  });

  it('carries the sentence the rule wrote, not a summary of it', () => {
    // Stored rather than regenerated: the rule that produced it may have moved
    // by the time anybody reads it.
    const kept = anchorToGoodBit(anchor({ reason: 'two kills, 3 seconds apart' }), 30);
    expect(kept.reason).toBe('two kills, 3 seconds apart');
    expect(kept.source).toBe('hud');
  });

  it('leaves a nameless reading nameless rather than inventing one', () => {
    expect(anchorToGoodBit(anchor({ kind: '' }), 30).name).toBeNull();
  });

  it('takes an unknown duration on trust', () => {
    // `Clip.durationSec` is nullable: a row written before that column existed
    // has not been probed. The server takes the range on trust in that case and
    // the next scan fills the length in.
    expect(anchorToGoodBit(anchor(), 0)).toMatchObject({ startSec: 9.5, endSec: 13.5 });
  });
});

describe('how long a render says it has left', () => {
  it('counts seconds under a minute and rounds to five above one', () => {
    /*
     * The estimate is elapsed time over progress, so its own error is larger
     * than a second by the time it is talking in minutes. A readout that
     * counted down one at a time would claim a precision it does not have.
     */
    expect(formatEta(12)).toBe('12s');
    expect(formatEta(59)).toBe('59s');
    expect(formatEta(63)).toBe('1m 5s');
    expect(formatEta(120)).toBe('2m');
    expect(formatEta(178)).toBe('3m');
  });

  it('says nothing when there is nothing worth saying', () => {
    // Null until there is enough progress for the estimate to mean anything: a
    // wrong number is worse than none.
    expect(formatEta(null)).toBeNull();
    expect(formatEta(Number.NaN)).toBeNull();
    expect(formatEta(-4)).toBeNull();
    // Rounds up rather than to "0s", which reads as finished.
    expect(formatEta(0.2)).toBe('1s');
  });
});
