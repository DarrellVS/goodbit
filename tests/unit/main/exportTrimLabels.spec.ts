import { describe, expect, it } from 'vitest';
import {
  planTimelineLabels,
  summariseLabels,
  type SuggestionFacts,
  type TimelineTrim,
} from '../../../src/main/services/highlights/timelineLabels.js';
import { labelKind } from '../../../src/main/services/highlights/labels.js';

/**
 * What a montage teaches the suggestion model.
 *
 * Nothing in the editor wrote a label before this, which meant
 * `trimAllToHighlights()`, a bulk accept-or-correct of the app's own
 * suggestions, was invisible to the model that made them.
 *
 * The rules that matter here are the ones about *what counts as a decision*,
 * because the label table is training data and a wrong row is worse than a
 * missing one.
 */

const trim = (clipId: number, trimStart: number, trimEnd: number): TimelineTrim => ({
  clipId,
  game: 'Battlefield 6',
  trimStart,
  trimEnd,
});

function facts(overrides: Partial<SuggestionFacts> = {}): SuggestionFacts {
  return {
    durationSec: 30,
    confident: true,
    window: { start: 10, end: 20 },
    peakZ: 2.1,
    spreadLu: 6,
    eventSec: 14,
    ...overrides,
  };
}

describe('planTimelineLabels', () => {
  it('files a cut that landed on the suggestion as an acceptance', () => {
    const labels = planTimelineLabels([trim(1, 10, 20)], new Map([[1, facts()]]));

    expect(labels).toHaveLength(1);
    expect(labelKind(labels[0])).toBe('accepted');
    expect(labels[0].suggested).toEqual({ start: 10, end: 20 });
  });

  it('allows a nudge, because a frame is not a disagreement', () => {
    // 0.4s at each end, which is the one judgement in `labels.ts`.
    const labels = planTimelineLabels([trim(1, 10.3, 19.7)], new Map([[1, facts()]]));
    expect(labelKind(labels[0])).toBe('accepted');
  });

  it('files a cut somewhere else as a correction', () => {
    const labels = planTimelineLabels([trim(1, 2, 8)], new Map([[1, facts()]]));
    expect(labelKind(labels[0])).toBe('trim');
  });

  it('still writes a label when there was nothing to suggest', () => {
    // "Somebody cut here and we had nothing to offer" is as useful to the
    // model as a correction, and it is the majority case: 76 of 174 clips in
    // the real library hold nothing the screen can name.
    const labels = planTimelineLabels([trim(1, 4, 9)], new Map([[1, null]]));

    expect(labels).toHaveLength(1);
    expect(labels[0].suggested).toBeNull();
    expect(labelKind(labels[0])).toBe('trim');
  });

  it('does not treat an unconfident reading as an offer that was declined', () => {
    // An unconfident window is the analysis saying it does not know. Recording
    // it as a suggestion the person corrected would teach the model that its
    // own shrug was wrong.
    const labels = planTimelineLabels(
      [trim(1, 2, 8)],
      new Map([[1, facts({ confident: false })]]),
    );

    expect(labels[0].suggested).toBeNull();
  });

  it('writes one label per appearance, because two ranges were chosen', () => {
    const labels = planTimelineLabels(
      [trim(1, 10, 20), trim(2, 0, 5), trim(1, 24, 29)],
      new Map([
        [1, facts()],
        [2, null],
      ]),
    );

    expect(labels).toHaveLength(3);
    expect(labels.map((label) => label.clipId)).toEqual([1, 2, 1]);
    // The first placement took the suggestion, the second is somewhere else.
    expect(labels.map(labelKind)).toEqual(['accepted', 'trim', 'trim']);
  });

  it('writes nothing for a timeline with nothing on it', () => {
    // A clip trimmed and then pulled off the timeline before export produces
    // no label, which is right: that was an experiment, not a decision.
    expect(planTimelineLabels([], new Map())).toEqual([]);
  });

  it('carries the measurement across, so the model has features to learn from', () => {
    const [label] = planTimelineLabels([trim(1, 10, 20)], new Map([[1, facts()]]));

    expect(label.durationSec).toBe(30);
    expect(label.peakZ).toBe(2.1);
    expect(label.spreadLu).toBe(6);
    expect(label.eventSec).toBe(14);
  });

  it('falls back to the chosen end when the clip length is unknown', () => {
    // What `TrimAndSwapClipAction` does, and the closest thing available: a
    // range cannot end after the recording does.
    const [label] = planTimelineLabels([trim(1, 2, 8)], new Map());
    expect(label.durationSec).toBe(8);
  });
});

describe('summariseLabels', () => {
  it('counts what the montage agreed with and what it corrected', () => {
    const labels = planTimelineLabels(
      [trim(1, 10, 20), trim(2, 1, 4), trim(3, 10, 20)],
      new Map([
        [1, facts()],
        [2, facts()],
        [3, facts()],
      ]),
    );

    expect(summariseLabels(labels)).toEqual({ accepted: 2, trim: 1 });
  });
});
