import { describe, expect, it } from 'vitest';
import {
  IDLE,
  stepSession,
  type SessionState,
} from '../../../src/main/services/capture/sessionEnd.js';

/**
 * Deciding that somebody has stopped playing.
 *
 * The whole feature rests on one distinction the foreground samples cannot
 * make: a game alt-tabbed away from and a game that has exited are the same
 * absence. Getting it wrong is not a crash, it is the app deciding to read
 * twelve clips off the disk while somebody is still in a match, which is the
 * one thing this must never do.
 *
 * None of these rules is re-derivable from the code, so they are stated here
 * as arithmetic: alive means playing, an exit has to settle before it is
 * believed, a relaunch of the same game is one session, and `unknown` ends
 * nothing.
 */

const GAME = 'C:/Games/bf6/bf6.exe';
const OTHER_GAME = 'C:/Games/ron/ron.exe';
const BROWSER = 'C:/Program Files/Chrome/chrome.exe';

const isGame = (exePath: string): boolean =>
  exePath.toLowerCase().includes('bf6') || exePath.toLowerCase().includes('ron');

const SETTLE = 20_000;

function sample(exePath: string, pid: number, at: number) {
  return { at, pid, exePath };
}

/** One tick, with the defaults every test shares. */
function step(
  state: SessionState,
  {
    at = null as ReturnType<typeof sample> | null,
    tracked = null as 'alive' | 'exited' | 'unknown' | null,
    now = 0,
  },
) {
  return stepSession(state, { sample: at, tracked, now, isGame, settleMs: SETTLE });
}

describe('starting to watch', () => {
  it('begins when a game is in front, and asks for its pid to be tracked', () => {
    const { state, track } = step(IDLE, { at: sample(GAME, 4242, 1000), now: 1000 });

    expect(state).toEqual({ phase: 'playing', exePath: GAME, pid: 4242, since: 1000 });
    expect(track).toBe(4242);
  });

  it('ignores everything that is not a game', () => {
    const { state, track } = step(IDLE, { at: sample(BROWSER, 99, 1000), now: 1000 });

    expect(state).toEqual(IDLE);
    expect(track).toBeUndefined();
  });

  it('dates the session from the sample, not from the tick it was read on', () => {
    // The clips from a session are dated by the clock, so the window has to be
    // in the same clock. A tick that lands late must not shorten it.
    const { state } = step(IDLE, { at: sample(GAME, 1, 8000), now: 9500 });

    expect(state).toMatchObject({ since: 8000 });
  });
});

describe('while a game is running', () => {
  const playing: SessionState = { phase: 'playing', exePath: GAME, pid: 4242, since: 1000 };

  it('an alt-tab is not the end of anything', () => {
    const { state, ended } = step(playing, {
      at: sample(BROWSER, 99, 30_000),
      tracked: 'alive',
      now: 30_000,
    });

    expect(state).toEqual(playing);
    expect(ended).toBeUndefined();
  });

  it('nothing said yet is not an ending either', () => {
    const { state, ended } = step(playing, { at: null, tracked: null, now: 30_000 });

    expect(state).toEqual(playing);
    expect(ended).toBeUndefined();
  });

  it('a process nobody could open ends nothing, ever', () => {
    // `unknown` means the handle could not be obtained, so there is no answer.
    // Treating it as an exit would sweep in the middle of a match.
    const { state, ended } = step(playing, { at: null, tracked: 'unknown', now: 999_999 });

    expect(state).toEqual(playing);
    expect(ended).toBeUndefined();
  });

  it('follows a second game that comes to the front', () => {
    const { state, track } = step(playing, {
      at: sample(OTHER_GAME, 77, 50_000),
      tracked: 'alive',
      now: 50_000,
    });

    expect(state).toEqual({ phase: 'playing', exePath: OTHER_GAME, pid: 77, since: 50_000 });
    expect(track).toBe(77);
  });

  it('starts settling the moment the process goes, and reports nothing yet', () => {
    const { state, ended } = step(playing, { at: null, tracked: 'exited', now: 60_000 });

    expect(state).toEqual({
      phase: 'settling',
      exePath: GAME,
      pid: 4242,
      since: 1000,
      leftAt: 60_000,
    });
    expect(ended).toBeUndefined();
  });
});

describe('settling, which is the part that stops a double sweep', () => {
  const settling: SessionState = {
    phase: 'settling',
    exePath: GAME,
    pid: 4242,
    since: 1000,
    leftAt: 60_000,
  };

  it('says nothing while the wait is still running', () => {
    const { state, ended } = step(settling, { at: null, now: 60_000 + SETTLE - 1 });

    expect(state).toEqual(settling);
    expect(ended).toBeUndefined();
  });

  it('ends the session once the wait is up', () => {
    const { state, ended, track } = step(settling, { at: null, now: 60_000 + SETTLE });

    expect(ended).toEqual({ exePath: GAME, pid: 4242, from: 1000, to: 60_000 });
    expect(state).toEqual(IDLE);
    // Nothing to watch any more, and a stale handle would pin a dead pid.
    expect(track).toBe(0);
  });

  it('treats the same game coming back as one session, not two', () => {
    // A crash and a relaunch, an anti-cheat wrapper re-execing, a launcher
    // starting the real game: a pid goes and another arrives.
    const { state, ended, track } = step(settling, {
      at: sample(GAME, 5555, 65_000),
      now: 65_000,
    });

    expect(ended).toBeUndefined();
    expect(track).toBe(5555);
    // The new pid, and the *original* start, so the window still covers what
    // was recorded before the crash.
    expect(state).toEqual({ phase: 'playing', exePath: GAME, pid: 5555, since: 1000 });
  });

  it('ends it early when a different game starts instead', () => {
    const { state, ended, track } = step(settling, {
      at: sample(OTHER_GAME, 77, 62_000),
      now: 62_000,
    });

    expect(ended).toEqual({ exePath: GAME, pid: 4242, from: 1000, to: 60_000 });
    expect(state).toEqual({ phase: 'playing', exePath: OTHER_GAME, pid: 77, since: 62_000 });
    expect(track).toBe(77);
  });

  it('ends at the moment the process went, not when that was believed', () => {
    // The session's clips are the ones recorded while it was running, and
    // twenty seconds of waiting is not twenty seconds of play.
    const { ended } = step(settling, { at: null, now: 60_000 + SETTLE * 3 });

    expect(ended?.to).toBe(60_000);
  });
});
