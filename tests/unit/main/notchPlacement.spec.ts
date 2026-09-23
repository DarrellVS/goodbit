import { describe, expect, it } from 'vitest';
import { hanging, stageToScreen, windowBounds } from '../../../src/main/services/notch/placement.js';

const stage = { along: 520, across: 300 };
// A 1920x1080 display with the taskbar along the bottom.
const area = { x: 0, y: 0, width: 1920, height: 1040 };

describe('where the window goes', () => {
  it('hangs from the middle of the top of the work area', () => {
    expect(windowBounds(area, stage)).toEqual({ x: 700, y: 0, width: 520, height: 300 });
  });

  it('hangs below a taskbar docked at the top', () => {
    const underTaskbar = { x: 0, y: 48, width: 1920, height: 1032 };
    expect(windowBounds(underTaskbar, stage).y).toBe(48);
  });

  it('follows a work area that does not start at zero, like a second monitor', () => {
    const second = { x: 1920, y: -200, width: 2560, height: 1400 };
    expect(windowBounds(second, stage)).toEqual({ x: 2940, y: -200, width: 520, height: 300 });
  });
});

describe('where the zone the pointer rests in ends up', () => {
  it('touches the top edge and is centred along it', () => {
    const win = windowBounds(area, stage);
    const zone = stageToScreen(win, hanging(stage, 280, 10));
    expect(zone).toEqual({ x: 820, y: 0, width: 280, height: 10 });
    expect(zone.x + zone.width / 2).toBe(area.width / 2);
  });
});
