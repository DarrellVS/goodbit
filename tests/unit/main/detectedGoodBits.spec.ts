import { describe, expect, it } from 'vitest';
import {
  DETECTED_LEAD_SEC,
  DETECTED_TAIL_SEC,
  alreadyMarked,
  detectedRange,
  momentName,
  momentsOf,
} from '../../../src/shared/detectedGoodBits.js';

describe('the range a found moment gets', () => {
  it('is half a second before and a second after', () => {
    expect(DETECTED_LEAD_SEC).toBe(0.5);
    expect(DETECTED_TAIL_SEC).toBe(1);
    expect(detectedRange({ atSec: 12.3 }, 30)).toEqual({ startSec: 11.8, endSec: 13.3 });
  });

  it('is not held to the six second floor a suggested trim gets', () => {
    const range = detectedRange({ atSec: 10 }, 30)!;
    expect(range.endSec - range.startSec).toBeCloseTo(1.5);
  });

  it('stops at the end of the clip', () => {
    expect(detectedRange({ atSec: 29.5 }, 30)).toEqual({ startSec: 29, endSec: 30 });
  });

  it('starts at the start of the clip', () => {
    expect(detectedRange({ atSec: 0.2 }, 30)).toEqual({ startSec: 0, endSec: 1.2 });
  });

  it('never rounds past the last frame', () => {
    const range = detectedRange({ atSec: 29.9 }, 29.97)!;
    expect(range.endSec).toBeLessThanOrEqual(29.97);
    expect(range.endSec).toBeGreaterThan(range.startSec);
  });

  it('keeps something to see for a moment on the very last frame', () => {
    const range = detectedRange({ atSec: 30 }, 30)!;
    expect(range).toEqual({ startSec: 29.5, endSec: 30 });
  });

  it('covers a moment that lasts, and a second past its end', () => {
    expect(detectedRange({ atSec: 5, untilSec: 9 }, 30)).toEqual({ startSec: 4.5, endSec: 10 });
  });

  it('refuses an instant outside the clip, or no instant at all', () => {
    expect(detectedRange({ atSec: 31 }, 30)).toBeNull();
    expect(detectedRange({ atSec: Number.NaN }, 30)).toBeNull();
  });

  it('takes the moment on trust when nobody has measured the clip yet', () => {
    expect(detectedRange({ atSec: 3 }, null)).toEqual({ startSec: 2.5, endSec: 4 });
  });
});

describe('not marking one instant twice', () => {
  it('sees an instant already inside a GoodBit', () => {
    const existing = [{ startSec: 4, endSec: 9 }];
    expect(alreadyMarked(6, existing)).toBe(true);
    expect(alreadyMarked(9, existing)).toBe(true);
    expect(alreadyMarked(9.5, existing)).toBe(false);
  });
});

describe('what an analysis is sure of', () => {
  const kill = { kind: 'kill', atSec: 4, confidence: 0.9, reason: 'a kill banner' };
  const death = { kind: 'death', atSec: 12, confidence: 0.8, reason: 'you went down' };

  it('is every moment the screen read, kills and deaths alike', () => {
    const moments = momentsOf({ anchors: [kill, death], confident: true, goodBits: [], reason: null });
    expect(moments.map((m) => [m.atSec, m.name, m.source])).toEqual([
      [4, 'Kill', 'hud'],
      [12, 'Death', 'hud'],
    ]);
    expect(moments[0].reason).toBe('a kill banner');
  });

  it('is the loudest instant when only the sound was sure', () => {
    const moments = momentsOf({
      anchors: [],
      confident: true,
      goodBits: [
        { t: 3, score: 0.4 },
        { t: 7, score: 0.9 },
      ],
      reason: 'it got loud',
    });
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ atSec: 7, source: 'audio', name: null, reason: 'it got loud' });
  });

  it('is nothing when the analysis is not sure', () => {
    expect(momentsOf({ anchors: [], confident: false, goodBits: [{ t: 3, score: 0.9 }], reason: null })).toEqual([]);
  });

  it('names a moment by its kind', () => {
    expect(momentName('multi-kill')).toBe('Multi kill');
    expect(momentName('')).toBeNull();
  });
});
