import { describe, expect, it } from 'vitest';
import {
  DWELL_MS,
  IDLE,
  LEAVE_MS,
  OPEN_PAD,
  STILL_PX,
  restingMode,
  stepHover,
  type HoverState,
  type Point,
} from '../../../src/main/services/notch/hover.js';

const zone = { x: 400, y: 0, width: 240, height: 8 };
const island = { x: 300, y: 0, width: 440, height: 200 };

function run(points: Array<[number, Point]>, start: HoverState = IDLE) {
  let state = start;
  const actions: Array<string | null> = [];
  for (const [now, point] of points) {
    const step = stepHover(state, { now, point, zone, island });
    state = step.state;
    actions.push(step.action);
  }
  return { state, actions };
}

describe('opening', () => {
  it('opens once the pointer has rested in the zone long enough', () => {
    const at = { x: 500, y: 0 };
    const { actions } = run([
      [0, at],
      [DWELL_MS - 1, at],
      [DWELL_MS, at],
    ]);
    expect(actions).toEqual([null, null, 'open']);
  });

  it('does not open for a pointer passing through on its way to a tab', () => {
    const { actions, state } = run([
      [0, { x: 420, y: 2 }],
      [50, { x: 460, y: 2 }],
      [100, { x: 500, y: 2 }],
      [150, { x: 540, y: 2 }],
      [200, { x: 580, y: 2 }],
      [250, { x: 620, y: 2 }],
    ]);
    expect(actions).not.toContain('open');
    expect(state.phase).toBe('dwelling');
  });

  it('forgives a small drift while resting', () => {
    const { actions } = run([
      [0, { x: 500, y: 0 }],
      [100, { x: 500 + STILL_PX, y: 0 }],
      [DWELL_MS, { x: 500, y: 0 }],
    ]);
    expect(actions.at(-1)).toBe('open');
  });

  it('never opens outside the zone, however long the pointer rests', () => {
    const below = { x: 500, y: 40 };
    const { actions, state } = run([
      [0, below],
      [DWELL_MS * 5, below],
    ]);
    expect(actions).toEqual([null, null]);
    expect(state).toEqual(IDLE);
  });
});

describe('closing', () => {
  const open: HoverState = { phase: 'open', outsideSince: null };

  it('stays open while the pointer is anywhere on the island', () => {
    const { actions } = run(
      [
        [0, { x: 320, y: 150 }],
        [1000, { x: 700, y: 20 }],
      ],
      open,
    );
    expect(actions).toEqual([null, null]);
  });

  it('forgives brushing past the edge', () => {
    const { actions } = run([[0, { x: 300 - OPEN_PAD, y: 100 }]], open);
    expect(actions).toEqual([null]);
  });

  it('folds after the grace once the pointer has gone', () => {
    const away = { x: 100, y: 500 };
    const { actions, state } = run(
      [
        [0, away],
        [LEAVE_MS - 1, away],
        [LEAVE_MS, away],
      ],
      open,
    );
    expect(actions).toEqual([null, null, 'close']);
    expect(state).toEqual(IDLE);
  });

  it('starts the grace again when the pointer comes back', () => {
    const away = { x: 100, y: 500 };
    const back = { x: 500, y: 100 };
    const { actions } = run(
      [
        [0, away],
        [200, back],
        [300, away],
        [300 + LEAVE_MS - 1, away],
      ],
      open,
    );
    expect(actions).not.toContain('close');
  });
});

describe('what stays on screen', () => {
  it('is the line on a quiet desktop', () => {
    expect(restingMode({ line: true, fullscreen: false, game: false })).toBe('line');
  });

  it('is nothing over a fullscreen video or a game', () => {
    expect(restingMode({ line: true, fullscreen: true, game: false })).toBe('hidden');
    expect(restingMode({ line: true, fullscreen: false, game: true })).toBe('hidden');
  });

  it('is nothing when the line is switched off', () => {
    expect(restingMode({ line: false, fullscreen: false, game: false })).toBe('hidden');
  });
});

describe('a wait somebody chose', () => {
  it('opens after the chosen wait rather than the default', () => {
    const at = { x: 500, y: 0 };
    let state: HoverState = IDLE;
    const actions: Array<string | null> = [];
    for (const now of [0, 399, 400]) {
      const step = stepHover(state, { now, point: at, zone, island, dwellMs: 400 });
      state = step.state;
      actions.push(step.action);
    }
    expect(actions).toEqual([null, null, 'open']);
  });

  it('opens on the next sample with no wait at all', () => {
    const at = { x: 500, y: 0 };
    const first = stepHover(IDLE, { now: 0, point: at, zone, island, dwellMs: 0 });
    const second = stepHover(first.state, { now: 50, point: at, zone, island, dwellMs: 0 });
    expect(second.action).toBe('open');
  });
});

describe('a grace somebody chose', () => {
  const open: HoverState = { phase: 'open', outsideSince: null };
  const away = { x: 100, y: 500 };

  it('folds on the next sample with no grace at all', () => {
    const step = stepHover(open, { now: 0, point: away, zone, island, leaveMs: 0 });
    expect(step.action).toBe('close');
  });

  it('waits out a longer grace', () => {
    let state: HoverState = open;
    const actions: Array<string | null> = [];
    for (const now of [0, 999, 1000]) {
      const step = stepHover(state, { now, point: away, zone, island, leaveMs: 1000 });
      state = step.state;
      actions.push(step.action);
    }
    expect(actions).toEqual([null, null, 'close']);
  });
});
