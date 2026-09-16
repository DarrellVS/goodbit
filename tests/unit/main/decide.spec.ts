import { describe, expect, it } from 'vitest';
import {
  decide,
  MIN_PEAK_Z,
  MIN_SPREAD_LU,
  type DecideInput,
} from '../../../src/main/services/highlights/decide.js';
import type { HighlightFeatures } from '../../../src/main/services/highlights/features.js';
import type { GameEvent } from '../../../src/main/services/highlights/registry.js';

/**
 * The verdict half of the highlight analysis.
 *
 * Worth locking down before anything else, because every threshold in here was
 * arrived at by measuring 88 real recordings across 24 games and none of it is
 * re-derivable from reading the code. A comparison that flips from `<` to `<=`
 * makes no test fail today and quietly changes what the app suggests, and the
 * only way anyone would notice is by looking at a library.
 *
 * These tests own the *boundaries* and the *precedence*, not the numbers: the
 * numbers are imported, so retuning a threshold with evidence stays a one-line
 * change. What must not move without somebody deciding it: a HUD reading beats
 * loudness, a game's own calibration can only raise the bar, and a clip with no
 * dynamic range is refused before the peak is even considered.
 */

/** A clip that clears every bar. Each test bends one field out of shape. */
function features(overrides: Partial<HighlightFeatures> = {}): HighlightFeatures {
  return {
    peakZ: 2.0,
    spreadLu: 12,
    eventSec: 1.8,
    position: 0.8,
    durationSec: 30,
    busyness: 0.4,
    runnerUpZ: 0.9,
    ...overrides,
  };
}

function verdict(input: Partial<DecideInput> = {}) {
  return decide({ features: features(), ...input });
}

describe('the thresholds are the ones that were measured', () => {
  it('holds the published numbers', () => {
    // A change here is a change to what the app suggests across a whole
    // library. It should be a deliberate edit with new measurements behind it,
    // not a side effect of a refactor.
    expect(MIN_PEAK_Z).toBe(1.3);
    expect(MIN_SPREAD_LU).toBe(6);
  });
});

describe('a clip with nothing to point at', () => {
  it('refuses one whose sound never changes, before looking at the peak', () => {
    // Ordering matters: a flat clip can still contain one sharp z spike, and
    // suggesting a moment inside a monotone recording is the case that made
    // this rule exist.
    const result = verdict({ features: features({ spreadLu: MIN_SPREAD_LU - 0.1, peakZ: 99 }) });

    expect(result.confident).toBe(false);
    expect(result.reason).toBe('the sound of this clip never really changes');
    expect(result.basis).toBe('rule');
  });

  it('accepts one sitting exactly on the spread floor', () => {
    expect(verdict({ features: features({ spreadLu: MIN_SPREAD_LU }) }).confident).toBe(true);
  });

  it('refuses one whose loudest moment does not stand out', () => {
    const result = verdict({ features: features({ peakZ: MIN_PEAK_Z - 0.01 }) });

    expect(result.confident).toBe(false);
    expect(result.reason).toBe('nothing in this clip really stands out from the rest of it');
  });

  it('accepts one sitting exactly on the bar', () => {
    // `peakZ < bar` refuses, so equality passes. The measured cases that had
    // to be kept start at 1.44 and the ones that had to go stop at 1.14, so
    // the boundary itself is arbitrary; which side it falls on is not.
    expect(verdict({ features: features({ peakZ: MIN_PEAK_Z }) }).confident).toBe(true);
  });

  it('says why, every time it says no', () => {
    const refusals = [
      verdict({ features: features({ spreadLu: 1 }) }),
      verdict({ features: features({ peakZ: 0 }) }),
    ];

    for (const result of refusals) {
      expect(result.reason).toBeTruthy();
      expect(result.evidence).toBeNull();
      expect(result.anchor).toBeNull();
    }
  });
});

describe("a game's own normal", () => {
  it('raises the bar for a game that is loud throughout', () => {
    // A racing game is a constant engine note. Its median clip already scores
    // 2.4, so 2.0 is unremarkable for it even though it clears the fixed bar.
    const result = verdict({ features: features({ peakZ: 2.0 }), gameMedianPeakZ: 2.4 });

    expect(result.confident).toBe(false);
    expect(result.bar).toBe(2.4);
  });

  it('never lowers it for a game that is quiet throughout', () => {
    // The dangerous direction. A horror game's median might be 0.4, and
    // letting calibration pull the bar down to that would confidently suggest
    // a moment in every clip of it.
    const result = verdict({ features: features({ peakZ: 0.5 }), gameMedianPeakZ: 0.4 });

    expect(result.bar).toBe(MIN_PEAK_Z);
    expect(result.confident).toBe(false);
  });

  it('treats null and undefined calibration as no calibration', () => {
    expect(verdict({ gameMedianPeakZ: null }).bar).toBe(MIN_PEAK_Z);
    expect(verdict({ gameMedianPeakZ: undefined }).bar).toBe(MIN_PEAK_Z);
  });

  it('does not treat a calibration of zero as missing', () => {
    // `0` is falsy and a real measurement. A `!gameMedianPeakZ` check here
    // would read as "no calibration" and quietly skip the max.
    expect(verdict({ gameMedianPeakZ: 0 }).bar).toBe(MIN_PEAK_Z);
  });
});

describe('what the game put on screen', () => {
  function kill(overrides: Partial<GameEvent> = {}): GameEvent {
    return {
      kind: 'kill',
      atSec: 24.5,
      confidence: 0.94,
      reason: 'the kill feed lit up',
      ...overrides,
    };
  }

  it('settles the question on its own, however quiet the clip is', () => {
    // The whole point of reading the HUD: a knife kill is silent, and the
    // loudness rule refuses it on both counts.
    const result = verdict({
      features: features({ spreadLu: 1, peakZ: 0 }),
      events: [kill()],
    });

    expect(result.confident).toBe(true);
    expect(result.basis).toBe('hud');
    expect(result.reason).toBeNull();
  });

  it('carries the sentence the module wrote, as the evidence', () => {
    const result = verdict({ events: [kill({ reason: 'two kills nine seconds apart' })] });

    expect(result.evidence).toBe('two kills nine seconds apart');
  });

  it('anchors on the most confident reading, not the first or the earliest', () => {
    const result = verdict({
      events: [
        kill({ atSec: 3, confidence: 0.81 }),
        kill({ atSec: 26, confidence: 0.97 }),
        kill({ atSec: 14, confidence: 0.9 }),
      ],
    });

    expect(result.anchor?.atSec).toBe(26);
  });

  it('ignores a reading it is not sure about', () => {
    // 0.8 is the floor, set well above what the near misses reached. Below it
    // the clip falls back to loudness, which here has nothing either.
    const result = verdict({
      features: features({ spreadLu: 1 }),
      events: [kill({ confidence: 0.79 })],
    });

    expect(result.confident).toBe(false);
    expect(result.basis).toBe('rule');
  });

  it('accepts a reading sitting exactly on the confidence floor', () => {
    expect(verdict({ events: [kill({ confidence: 0.8 })] }).basis).toBe('hud');
  });

  it('is unbothered by an empty list or none at all', () => {
    expect(verdict({ events: [] }).basis).toBe('rule');
    expect(verdict({}).basis).toBe('rule');
  });

  /**
   * The line 2.1 is built on.
   *
   * `decide()` sorts the events by confidence and takes `[0]`. A clip with
   * three kills in it has already paid for finding all three, and two of them
   * are dropped here. This test does not assert that they survive, because
   * today they do not: it pins the shape of what is being thrown away, so the
   * change that keeps them has something to compare against.
   */
  it('keeps one of several events, which is what 2.1 changes', () => {
    const result = verdict({
      events: [
        kill({ atSec: 4, confidence: 0.91 }),
        kill({ atSec: 17, confidence: 0.93 }),
        kill({ atSec: 28, confidence: 0.88 }),
      ],
    });

    expect(result.anchor).not.toBeNull();
    expect(result.anchor?.atSec).toBe(17);
    expect(Object.keys(result)).not.toContain('anchors');
  });
});

describe('the shape of a verdict', () => {
  it('always reports the bar it used, whatever decided it', () => {
    for (const result of [
      verdict(),
      verdict({ features: features({ peakZ: 0 }) }),
      verdict({ gameMedianPeakZ: 3.1 }),
    ]) {
      expect(typeof result.bar).toBe('number');
      expect(Number.isFinite(result.bar)).toBe(true);
    }
  });

  it('never gives a reason and a yes at the same time', () => {
    for (const result of [
      verdict(),
      verdict({ features: features({ spreadLu: 0 }) }),
      verdict({ events: [{ kind: 'kill', atSec: 1, confidence: 1, reason: 'x' }] }),
    ]) {
      expect(result.confident).toBe(result.reason === null);
    }
  });
});
