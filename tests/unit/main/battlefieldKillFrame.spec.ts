import { describe, expect, it } from 'vitest';
import { isKillFrame } from '../../../src/main/services/highlights/games/battlefield.js';
import { highPass } from '../../../src/main/services/highlights/vision/pixels.js';

/**
 * Whether one sampled frame shows a kill banner of your own.
 *
 * Every row below is a real frame from the library, scored by the shipped
 * matcher, and was checked by eye on a contact sheet. The pixels need a GPU
 * and the library and live in `scripts/hud-check.mjs`; these are the numbers
 * that came out, so a threshold that moves has to explain itself here.
 */
describe('isKillFrame', () => {
  it('believes a clean banner on the plain reading alone', () => {
    expect(isKillFrame({ skull: 0.95, label: 0.4, saturation: 0.05 })).toBe(true);
    expect(isKillFrame({ skull: 0.6, label: 0.85, saturation: 0.05 })).toBe(true);
  });

  it('turns down a green skull, which is an assist', () => {
    expect(isKillFrame({ skull: 0.95, label: 0.9, saturation: 0.4 })).toBe(false);
  });

  it('reads a banner over bright rock through the high-passed skull and word', () => {
    // GoodBit 2026-09-20 15-23-58, 26.00 s and 26.25 s: KILL legible over
    // pale sand, and neither plain score anywhere near its bar.
    expect(isKillFrame({ skull: 0.807, label: 0.324, skullHp: 0.683, labelHp: 0.665, saturation: 0.047 })).toBe(true);
    expect(isKillFrame({ skull: 0.688, label: 0.357, skullHp: 0.61, labelHp: 0.758, saturation: 0.061 })).toBe(true);
  });

  it('turns down REVIVE, whose round pulse only resembles a skull with its ground left in', () => {
    // Battlefield 6_07.05.2026_22-43-51, 24.25 s.
    expect(isKillFrame({ skull: 0.655, label: 0.598, skullHp: 0.221, labelHp: 0.654, saturation: 0.08 })).toBe(false);
  });

  it('turns down a boxed word that is not KILL when the skull is not really there', () => {
    // DAMAGE ASSIST banners pass a high-passed word of 0.56 and fail on the skull.
    expect(isKillFrame({ skull: 0.7, label: 0.5, skullHp: 0.36, labelHp: 0.66, saturation: 0.1 })).toBe(false);
  });

  it('needs both halves of the second reading', () => {
    expect(isKillFrame({ skull: 0.8, label: 0.3, skullHp: 0.7, labelHp: 0.55, saturation: 0.05 })).toBe(false);
    expect(isKillFrame({ skull: 0.8, label: 0.3, skullHp: 0.7, saturation: 0.05 })).toBe(false);
    expect(isKillFrame({ skull: 0.58, label: 0.3, skullHp: 0.7, labelHp: 0.8, saturation: 0.05 })).toBe(false);
  });
});

describe('highPass', () => {
  it('flattens a uniform ground to zero whatever its brightness', () => {
    for (const level of [20, 210]) {
      const out = highPass(new Array(25).fill(level), 5, 5, 1);
      expect(Math.max(...out.map(Math.abs))).toBe(0);
    }
  });

  it('keeps a bright stroke standing above its surroundings', () => {
    const plane = new Array(49).fill(200);
    plane[3 * 7 + 3] = 250;
    const out = highPass(plane, 7, 7, 1);
    expect(out[3 * 7 + 3]).toBeGreaterThan(40);
    expect(out[0]).toBeCloseTo(0);
  });
});
