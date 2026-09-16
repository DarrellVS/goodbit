import { describe, expect, it } from 'vitest';
import {
  TENTH_SEC,
  frameAt,
  frameCentre,
  frameCount,
  frameRateLabel,
  frameSpanLabel,
  frameStart,
  formatTimecode,
  parseFrameRate,
  stepOnTenths,
  stepToFrameCentre,
  stepToFrameStart,
} from '../../../src/renderer/src/utils/frameRate';

/**
 * A time and a frame rate, to a frame and back.
 *
 * This is nearly all of item 3.3. The backend already cuts to the frame, so
 * what the trim page was missing was arithmetic: which frame is under a time,
 * what a step lands on, whether a hundred steps land a hundred frames along,
 * and what any of it says when nothing has reported a frame rate.
 *
 * None of it can be checked by looking at the app. A control that is off by
 * one frame, or that drifts half a frame every fifty presses, looks exactly
 * like a control that works, which is the argument for the whole unit suite.
 */

/** The rates that actually turn up: OBS integers, and the NTSC pulldowns. */
const RATES = [60, 60000 / 1001, 50, 30, 30000 / 1001, 24000 / 1001, 120];

describe('reading ffprobe frame rate', () => {
  it('divides out the rational ffprobe actually sends', () => {
    expect(parseFrameRate('60/1')).toBe(60);
    expect(parseFrameRate('30/1')).toBe(30);
    expect(parseFrameRate('60000/1001')).toBeCloseTo(59.94005994, 8);
    expect(parseFrameRate('24000/1001')).toBeCloseTo(23.976023976, 8);
  });

  it('takes a bare number, and a number', () => {
    expect(parseFrameRate('30')).toBe(30);
    expect(parseFrameRate(' 60 ')).toBe(60);
    expect(parseFrameRate(59.94)).toBe(59.94);
  });

  it('says null rather than guessing, for every way ffprobe says it does not know', () => {
    // `0/0` is ffprobe's own "unknown" and is the one that matters: divided out
    // naively it is NaN, and NaN silently makes every frame calculation NaN.
    expect(parseFrameRate('0/0')).toBeNull();
    expect(parseFrameRate('0/1')).toBeNull();
    expect(parseFrameRate('60/0')).toBeNull();
    expect(parseFrameRate('N/A')).toBeNull();
    expect(parseFrameRate('')).toBeNull();
    expect(parseFrameRate('   ')).toBeNull();
    expect(parseFrameRate(null)).toBeNull();
    expect(parseFrameRate(undefined)).toBeNull();
    expect(parseFrameRate('-30/1')).toBeNull();
  });

  it('refuses a timebase dressed up as a frame rate', () => {
    // `GetClipMetaAction` falls back to `r_frame_rate`, which on some
    // containers is the stream's timebase. Believing `90000/1` would make a
    // frame eleven microseconds long, so an arrow key would do nothing
    // visible and the readout would count to ninety thousand.
    expect(parseFrameRate('90000/1')).toBeNull();
    expect(parseFrameRate('1000/1')).toBeNull();
    // A tenth of a frame a second is a timelapse, not a game clip.
    expect(parseFrameRate('1/10')).toBeNull();
    // The band itself, at both ends.
    expect(parseFrameRate('480/1')).toBe(480);
    expect(parseFrameRate('481/1')).toBeNull();
    expect(parseFrameRate('1/1')).toBe(1);
  });
});

describe('which frame a time is', () => {
  it('floors, because a frame is an interval and not an instant', () => {
    // Frame n runs from n/fps up to but not including (n+1)/fps, so a time a
    // hair before a boundary is still the frame before it, which is what is on
    // screen. Rounding instead would put the readout a frame ahead of the
    // picture for the second half of every frame.
    expect(frameAt(0, 60)).toBe(0);
    expect(frameAt(0.9 / 60, 60)).toBe(0);
    expect(frameAt(1 / 60, 60)).toBe(1);
    expect(frameAt(1.999 / 60, 60)).toBe(1);
    expect(frameAt(1, 60)).toBe(60);
  });

  it('never goes negative, whatever it is handed', () => {
    expect(frameAt(-5, 60)).toBe(0);
    expect(frameCount(-5, 60)).toBe(0);
    expect(frameCount(0, 60)).toBe(0);
  });

  it('counts the whole frames in a length', () => {
    expect(frameCount(30, 60)).toBe(1800);
    expect(frameCount(1, 30)).toBe(30);
    // Not a whole number of frames: the part frame at the end is not one.
    expect(frameCount(1.5, 60)).toBe(90);
    expect(frameCount(0.99, 60)).toBe(59);
  });

  /**
   * The epsilon in `frameAt` is load-bearing, and this is the test that says
   * so. `frame / fps * fps` is not always `frame` in binary floating point,
   * and a hair low means the floor lands a whole frame early. Measured over
   * ten minutes of footage without it: 813 boundaries wrong at 60 fps, 952 at
   * 59.94, 1,849 at 50.
   */
  it('round trips every frame boundary of a long clip, at every rate that turns up', () => {
    // A minute per rate, which is twice the length of anything in this
    // library and still runs in a fraction of the suite's budget.
    for (const fps of RATES) {
      const frames = Math.round(60 * fps);
      for (let n = 0; n <= frames; n++) {
        expect(frameAt(frameStart(n, fps), fps)).toBe(n);
        expect(frameAt(frameCentre(n, fps), fps)).toBe(n);
      }
    }
  });

  it('puts the playhead in the middle of a frame and not on its seam', () => {
    // `video.currentTime = n / fps` sits exactly between two frames, and one
    // ULP low picks the frame before. Half a frame is the largest margin
    // available and it is what the seek is given.
    expect(frameCentre(0, 60)).toBeCloseTo(0.5 / 60, 12);
    expect(frameCentre(10, 60) - frameStart(10, 60)).toBeCloseTo(0.5 / 60, 12);
  });
});

describe('stepping a handle by whole frames', () => {
  it('moves exactly one frame per step, forwards and back', () => {
    let time = 0;
    for (let n = 1; n <= 200; n++) {
      time = stepToFrameStart(time, 1, 60, 30);
      expect(frameAt(time, 60)).toBe(n);
    }
    for (let n = 199; n >= 0; n--) {
      time = stepToFrameStart(time, -1, 60, 30);
      expect(frameAt(time, 60)).toBe(n);
    }
    expect(time).toBe(0);
  });

  /**
   * The drift test, and the reason the step is taken on the frame index rather
   * than on the time. Adding `1/fps` to a float does drift, and at 59.94 it is
   * the kind of drift that shows: this walks the whole of a thirty second clip
   * and asserts every landing is the exact frame asked for.
   */
  it('does not drift across a whole clip at a rate that is not a whole number', () => {
    const fps = 60000 / 1001;
    const duration = 30;
    let time = 0;
    const total = frameCount(duration, fps);

    for (let n = 1; n < total; n++) {
      time = stepToFrameStart(time, 1, fps, duration);
      expect(frameAt(time, fps)).toBe(n);
    }
    // And the last step is the end of the recording rather than a boundary.
    // A thirty second clip at 59.94 holds 1798 whole frames and part of one
    // more, so the last boundary is 29.9966 and the file ends at 30. A handle
    // that stopped at the boundary could not keep the whole clip.
    expect(time).toBeCloseTo((total - 1) / fps, 9);
    expect(stepToFrameStart(time, 1, fps, duration)).toBe(duration);
    expect(stepToFrameStart(duration, 1, fps, duration)).toBe(duration);
  });

  it('takes ten at a time without landing anywhere different from ten ones', () => {
    const fps = 60000 / 1001;
    let byTen = 0;
    let byOne = 0;
    for (let i = 0; i < 20; i++) {
      byTen = stepToFrameStart(byTen, 10, fps, 30);
      for (let j = 0; j < 10; j++) byOne = stepToFrameStart(byOne, 1, fps, 30);
    }
    expect(byTen).toBe(byOne);
    expect(frameAt(byTen, fps)).toBe(200);
  });

  it('stops at nothing, not at a negative time', () => {
    expect(stepToFrameStart(0, -1, 60, 30)).toBe(0);
    expect(stepToFrameStart(0, -50, 60, 30)).toBe(0);
    expect(stepToFrameStart(1 / 60, -5, 60, 30)).toBe(0);
  });

  /**
   * The end handle has to reach the end of the recording.
   *
   * Clamping it to the last frame's *start* would leave every trim that used
   * to run to the end one frame short, silently, for ever.
   */
  it('lets a handle sit at the very end of the clip', () => {
    expect(stepToFrameStart(30, 1, 60, 30)).toBe(30);
    expect(stepToFrameStart(29.9, 100, 60, 30)).toBe(30);
    // And one frame back from the end is the start of the last frame.
    expect(stepToFrameStart(30, -1, 60, 30)).toBeCloseTo(1799 / 60, 9);
  });

  it('holds a handle on a clip whose length is not a whole number of frames', () => {
    const duration = 30.017;
    const landed = stepToFrameStart(duration, 1, 60, duration);
    expect(landed).toBeLessThanOrEqual(duration);
    expect(stepToFrameStart(duration, -1, 60, duration)).toBeLessThan(landed);
  });
});

describe('stepping the playhead', () => {
  it('lands in the middle of the frame it was asked for', () => {
    const at = stepToFrameCentre(0, 5, 60, 30);
    expect(frameAt(at, 60)).toBe(5);
    expect(at).toBeCloseTo(5.5 / 60, 12);
  });

  it('is exact over a long walk, because it re-quantises every time', () => {
    const fps = 60000 / 1001;
    let time = 0;
    for (let n = 1; n <= 1000; n++) {
      time = stepToFrameCentre(time, 1, fps, 30);
      expect(frameAt(time, fps)).toBe(n);
    }
  });

  it('stops at the last frame, where there is still something to see', () => {
    // Not at the boundary after it: the handle may sit at the end of the file
    // and the playhead may not, because there is no picture there.
    const at = stepToFrameCentre(30, 10, 60, 30);
    expect(frameAt(at, 60)).toBe(1799);
    expect(at).toBeLessThan(30);
    expect(stepToFrameCentre(0, -3, 60, 30)).toBeCloseTo(0.5 / 60, 12);
  });

  it('survives a clip with no length yet', () => {
    expect(stepToFrameCentre(0, 1, 60, 0)).toBe(0);
    expect(stepToFrameStart(0, 1, 60, 0)).toBe(0);
  });
});

describe('stepping without a frame rate', () => {
  it('moves a tenth, quantised the same way so it cannot drift either', () => {
    let time = 0;
    for (let n = 1; n <= 100; n++) {
      time = stepOnTenths(time, 1, 30);
      expect(time).toBeCloseTo(n * TENTH_SEC, 9);
    }
    // Exactly, not nearly: a hundred tenths is ten seconds and no remainder.
    expect(time).toBe(10);
  });

  it('snaps a time that is not on the grid before it moves', () => {
    expect(stepOnTenths(4.47, 1, 30)).toBeCloseTo(4.6, 9);
    expect(stepOnTenths(4.44, -1, 30)).toBeCloseTo(4.3, 9);
  });

  it('clamps at both ends', () => {
    expect(stepOnTenths(0, -1, 30)).toBe(0);
    expect(stepOnTenths(30, 5, 30)).toBe(30);
  });
});

describe('what the readout says', () => {
  it('writes the position to the frame', () => {
    expect(formatTimecode(0, 60)).toBe('0:00:00');
    expect(formatTimecode(1 / 60, 60)).toBe('0:00:01');
    expect(formatTimecode(12 + 20 / 60, 60)).toBe('0:12:20');
    expect(formatTimecode(65, 60)).toBe('1:05:00');
  });

  it('wraps the frame field cleanly, which is the point of a stepping readout', () => {
    // One press always changes the last field by exactly one, and the second
    // rolls over where the frames run out. Anything else and the number under
    // the key being pressed stutters.
    expect(formatTimecode(59 / 60, 60)).toBe('0:00:59');
    expect(formatTimecode(60 / 60, 60)).toBe('0:01:00');
    expect(formatTimecode(61 / 60, 60)).toBe('0:01:01');
  });

  it('pads the frame field to the width the rate needs', () => {
    expect(formatTimecode(100 / 120, 120)).toBe('0:00:100');
    expect(formatTimecode(5 / 120, 120)).toBe('0:00:005');
    expect(formatTimecode(5 / 30, 30)).toBe('0:00:05');
  });

  it('adds an hours field only when there is one', () => {
    expect(formatTimecode(3599, 60)).toBe('59:59:00');
    expect(formatTimecode(3600, 60)).toBe('1:00:00:00');
    expect(formatTimecode(3661, 60)).toBe('1:01:01:00');
  });

  /**
   * Non drop frame, which is what every editor shows and what a stepping
   * readout needs. At 60 and at 30, the rates OBS is set up to record here, it
   * is identical to the clock. At 59.94 it runs 0.1% slow against it, two
   * frames over a thirty second clip, which is what non drop has always cost.
   */
  it('is non drop, and says so by drifting from the clock at 59.94', () => {
    const fps = 60000 / 1001;
    expect(formatTimecode(0, fps)).toBe('0:00:00');
    // Thirty seconds of wall clock is 1798 frames at 59.94, which non drop
    // writes as 29 seconds and 58 frames.
    expect(formatTimecode(30, fps)).toBe('0:29:58');
    // And at a whole rate there is no drift at all.
    expect(formatTimecode(30, 60)).toBe('0:30:00');
  });

  it('falls back to hundredths when nothing has reported a rate', () => {
    // The full stop against the colon is the only thing separating the two on
    // screen, which is why the timeline prints the rate beside them.
    expect(formatTimecode(12.33, null)).toBe('0:12.33');
    expect(formatTimecode(0, null)).toBe('0:00.00');
    expect(formatTimecode(65.5, null)).toBe('1:05.50');
  });

  it('does not print a negative or a NaN at somebody', () => {
    expect(formatTimecode(-4, 60)).toBe('0:00:00');
    expect(formatTimecode(Number.NaN, 60)).toBe('0:00:00');
    expect(formatTimecode(Number.NaN, null)).toBe('0:00.00');
  });

  it('counts the frames in a range, and declines to when it cannot', () => {
    expect(frameSpanLabel(8.2, 60)).toBe('492 frames');
    expect(frameSpanLabel(1 / 60, 60)).toBe('1 frame');
    expect(frameSpanLabel(0, 60)).toBe('0 frames');
    expect(frameSpanLabel(-3, 60)).toBe('0 frames');
    expect(frameSpanLabel(8.2, null)).toBeNull();
  });

  it('writes the rate the way the details panel already does', () => {
    expect(frameRateLabel(60)).toBe('60 fps');
    expect(frameRateLabel(60000 / 1001)).toBe('59.94 fps');
    expect(frameRateLabel(null)).toBeNull();
  });
});
