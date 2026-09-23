import { describe, expect, it } from 'vitest';
import {
  NOTCH_DWELL,
  NOTCH_LEAVE,
  notchDwellMs,
  notchLeaveMs,
  notchEnabled,
  resolveNotch,
} from '../../../src/shared/notchSettings.js';

describe('what the notch is before anybody has set it', () => {
  it('is on for a new install, line and all', () => {
    const plan = resolveNotch({});
    expect(plan.enabled).toBe(true);
    expect(plan.line).toBe(true);
    expect(plan.clipPeek).toBe(true);
  });

  it('is on for somebody who had the corner card', () => {
    expect(notchEnabled({ clipToast: true })).toBe(true);
    expect(resolveNotch({ clipToast: true }).line).toBe(true);
  });

  // The one rule that cannot be re-derived from reading the code: somebody who
  // switched the card off said "draw nothing over my screen", and an update must
  // not answer that with a line at the top of it.
  it('is off for somebody who had turned the corner card off', () => {
    const plan = resolveNotch({ clipToast: false });
    expect(plan.enabled).toBe(false);
    expect(plan.line).toBe(false);
    expect(plan.clipPeek).toBe(false);
    expect(plan.sweepPeek).toBe(false);
  });

  it('is whatever it was set to, once set', () => {
    expect(notchEnabled({ notch: true, clipToast: false })).toBe(true);
    expect(notchEnabled({ notch: false, clipToast: true })).toBe(false);
  });
});

describe('the combinations', () => {
  it('draws nothing at all with the notch off, whatever sits under it', () => {
    const plan = resolveNotch({
      notch: false,
      notchAlwaysOn: true,
      clipToast: true,
      clipToastSound: true,
      analyzeOnGameCloseToast: true,
    });
    expect(plan).toMatchObject({
      enabled: false,
      line: false,
      clipPeek: false,
      clipSound: false,
      sweepPeek: false,
      sweepSound: false,
      invisible: false,
    });
  });

  it('brings the line with it when always on was never set', () => {
    expect(resolveNotch({ notch: true }).line).toBe(true);
  });

  it('peeks without a line, which is the old card at the top of the screen', () => {
    const plan = resolveNotch({ notch: true, notchAlwaysOn: false, clipToast: true });
    expect(plan.line).toBe(false);
    expect(plan.clipPeek).toBe(true);
    expect(plan.invisible).toBe(false);
  });

  it('keeps the line without peeking', () => {
    const plan = resolveNotch({ notch: true, notchAlwaysOn: true, clipToast: false });
    expect(plan.line).toBe(true);
    expect(plan.clipPeek).toBe(false);
    expect(plan.clipSound).toBe(false);
  });

  it('says so when the notch is on and nothing it does is', () => {
    const plan = resolveNotch({
      notch: true,
      notchAlwaysOn: false,
      clipToast: false,
      analyzeOnGameCloseToast: false,
    });
    expect(plan.invisible).toBe(true);
  });

  it('is not invisible while the sweep can still open it', () => {
    const plan = resolveNotch({ notch: true, notchAlwaysOn: false, clipToast: false });
    expect(plan.sweepPeek).toBe(true);
    expect(plan.invisible).toBe(false);
  });

  it('never plays a sound for a peek that is off', () => {
    expect(resolveNotch({ notch: true, clipToast: false, clipToastSound: true }).clipSound).toBe(false);
    expect(
      resolveNotch({ notch: true, analyzeOnGameClose: false, analyzeOnGameCloseSound: true })
        .sweepSound,
    ).toBe(false);
  });

  it('does not sweep-peek when the sweep itself is off', () => {
    expect(resolveNotch({ notch: true, analyzeOnGameClose: false }).sweepPeek).toBe(false);
  });
});

describe('how long the pointer rests before it opens', () => {
  it('is the default when never set', () => {
    expect(notchDwellMs({})).toBe(NOTCH_DWELL.default);
  });

  it('is whatever was set, inside the range', () => {
    expect(notchDwellMs({ notchDwellMs: 300 })).toBe(300);
    expect(notchDwellMs({ notchDwellMs: 0 })).toBe(0);
  });

  // A hand-edited settings.json must not make the notch unopenable or negative.
  it('is clamped to the range, and a nonsense value falls back', () => {
    expect(notchDwellMs({ notchDwellMs: -50 })).toBe(NOTCH_DWELL.min);
    expect(notchDwellMs({ notchDwellMs: 99_999 })).toBe(NOTCH_DWELL.max);
    expect(notchDwellMs({ notchDwellMs: Number.NaN })).toBe(NOTCH_DWELL.default);
  });
});

describe('how long it stays once the pointer has gone', () => {
  it('is the default when never set, and clamped like the wait to open', () => {
    expect(notchLeaveMs({})).toBe(NOTCH_LEAVE.default);
    expect(notchLeaveMs({ notchLeaveMs: 0 })).toBe(0);
    expect(notchLeaveMs({ notchLeaveMs: -1 })).toBe(NOTCH_LEAVE.min);
    expect(notchLeaveMs({ notchLeaveMs: 1e9 })).toBe(NOTCH_LEAVE.max);
  });
});
