/**
 * When the notch opens under the pointer, and when it lets go.
 *
 * Pure, so `tests/unit` owns the timings without a window. `index.ts` feeds it
 * one cursor sample every `POLL_MS` and acts on what comes back.
 *
 * ## Why the pointer is polled rather than listened to
 *
 * The window is click-through while it is a line, and a click-through window is
 * sent nothing, so the page cannot see the pointer arrive. And once it is open,
 * `mouseleave` in a transparent window that never takes focus is unreliable:
 * Codenotch found a quick exit often produces none and the card stays up. So
 * main asks where the cursor is and decides, and the page only draws.
 *
 * ## Why it waits before opening
 *
 * The middle of the top edge is where the pointer goes to do other things: a
 * maximised browser's tabs, a title bar, a menu, and the snap bar Windows 11
 * shows while a window is dragged there. Opening on touch would put an island
 * over every one of them. Somebody aiming at a tab moves or clicks; somebody
 * who wants to look lets the pointer rest. So it opens after `DWELL_MS` of the
 * pointer staying put in the zone, and moving more than `STILL_PX` restarts the
 * wait. Short on purpose: 220 ms felt like having to hold it there, and a
 * pointer on its way to a tab is still moving far more than twelve pixels in
 * that time.
 *
 * The wait is the only delay. Whatever the island shows is read before the
 * pointer arrives, so opening never waits on a query or on `tasklist`.
 *
 * The top edge is also what makes a zone this thin usable at all: a pointer
 * thrown upwards stops at y = 0, so a few pixels of height behave as if they
 * were endless.
 */

import { NOTCH_DWELL, NOTCH_LEAVE } from '@shared/notchSettings.js';

/** How often main samples the cursor while the line is showing. */
export const POLL_MS = 50;

/**
 * How long the pointer has to rest in the zone before the notch opens, unless
 * the setting says otherwise (`notchDwellMs`).
 */
export const DWELL_MS = NOTCH_DWELL.default;

/** How far the pointer may drift during that wait and still count as resting. */
export const STILL_PX = 12;

/**
 * How long the pointer has to be off the open island before it folds, unless
 * the setting says otherwise (`notchLeaveMs`).
 *
 * A grace rather than an instant by default, because leaving by a few pixels on
 * the way to a button inside it should not close it.
 */
export const LEAVE_MS = NOTCH_LEAVE.default;

/**
 * Slack around the island while it is open, in pixels.
 *
 * Sampled on a timer, so a pointer brushing the edge should not read as gone.
 */
export const OPEN_PAD = 12;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function within(point: Point, rect: Rect, pad = 0): boolean {
  return (
    point.x >= rect.x - pad &&
    point.x < rect.x + rect.width + pad &&
    point.y >= rect.y - pad &&
    point.y < rect.y + rect.height + pad
  );
}

export type HoverState =
  | { phase: 'idle' }
  | { phase: 'dwelling'; since: number; anchor: Point }
  | { phase: 'open'; outsideSince: number | null };

export const IDLE: HoverState = { phase: 'idle' };

export interface HoverSample {
  now: number;
  point: Point;
  /** The zone over the line, where resting opens the notch. */
  zone: Rect;
  /** The open island, where the pointer has to stay to keep it open. */
  island: Rect;
  /** How long to rest before opening. `DWELL_MS` when not given. */
  dwellMs?: number;
  /** How long off the island before it folds. `LEAVE_MS` when not given. */
  leaveMs?: number;
  /**
   * More shapes that count as the island while it is open: the wings' handles
   * and whichever wings are out. Moving from the island into a wing must not
   * fold the island behind it.
   */
  keep?: Rect[];
}

export interface HoverStep {
  state: HoverState;
  action: 'open' | 'close' | null;
}

export function stepHover(state: HoverState, sample: HoverSample): HoverStep {
  const { now, point, zone, island, dwellMs = DWELL_MS, leaveMs = LEAVE_MS, keep = [] } = sample;

  if (state.phase === 'open') {
    if (within(point, island, OPEN_PAD) || keep.some((rect) => within(point, rect, OPEN_PAD))) {
      return { state: { phase: 'open', outsideSince: null }, action: null };
    }
    const outsideSince = state.outsideSince ?? now;
    if (now - outsideSince >= leaveMs) return { state: IDLE, action: 'close' };
    return { state: { phase: 'open', outsideSince }, action: null };
  }

  if (!within(point, zone)) return { state: IDLE, action: null };

  if (state.phase === 'idle') {
    return { state: { phase: 'dwelling', since: now, anchor: point }, action: null };
  }

  const drift = Math.hypot(point.x - state.anchor.x, point.y - state.anchor.y);
  if (drift > STILL_PX) {
    return { state: { phase: 'dwelling', since: now, anchor: point }, action: null };
  }
  if (now - state.since >= dwellMs) {
    return { state: { phase: 'open', outsideSince: null }, action: 'open' };
  }
  return { state, action: null };
}

/**
 * What stays on screen between peeks.
 *
 * The line only when it is switched on and nothing in front owns the screen:
 * a game, windowed or not, or anything covering its whole monitor, which is a
 * fullscreen video as much as a borderless game. A line over a film is exactly
 * the distraction this is meant not to be.
 */
export function restingMode(input: {
  line: boolean;
  fullscreen: boolean;
  game: boolean;
}): 'line' | 'hidden' {
  return input.line && !input.fullscreen && !input.game ? 'line' : 'hidden';
}

/*
 * A wing, opened from its handle.
 *
 * The same habit as the island, one level down: rest on the handle for the
 * dwell and the wing opens, leave the handle and the wing for the grace and it
 * folds. `handle` is the zone beside the island (`WING_REACH` out, the
 * island's full height) rather than the pill drawn in it, so it is easy to
 * land on, and a pointer crossing it on the way somewhere else never rests
 * long enough to open anything.
 */

export type WingHover =
  | { phase: 'closed' }
  | { phase: 'dwelling'; since: number }
  | { phase: 'open'; outsideSince: number | null };

export const WING_CLOSED: WingHover = { phase: 'closed' };

export interface WingSample {
  now: number;
  point: Point;
  handle: Rect;
  panel: Rect;
  dwellMs?: number;
  leaveMs?: number;
}

export function stepWing(state: WingHover, sample: WingSample): WingHover {
  const { now, point, handle, panel, dwellMs = DWELL_MS, leaveMs = LEAVE_MS } = sample;

  if (state.phase === 'open') {
    if (within(point, panel, OPEN_PAD) || within(point, handle)) {
      return state.outsideSince === null ? state : { phase: 'open', outsideSince: null };
    }
    const outsideSince = state.outsideSince ?? now;
    if (now - outsideSince >= leaveMs) return WING_CLOSED;
    return { phase: 'open', outsideSince };
  }

  if (!within(point, handle)) return WING_CLOSED;
  if (state.phase === 'closed') {
    return dwellMs <= 0 ? { phase: 'open', outsideSince: null } : { phase: 'dwelling', since: now };
  }
  if (now - state.since >= dwellMs) return { phase: 'open', outsideSince: null };
  return state;
}
