import type { ForegroundSample, TrackedState } from './foregroundHistory.js';

/**
 * Deciding that somebody has stopped playing, from what the samples can say.
 *
 * The samples cannot say it. `foregroundHistory` answers "what is in front",
 * and a game alt-tabbed away from and a game that has exited are the same
 * absence: Discord in front for thirty seconds looks exactly like a session
 * ending. So the question is asked of a pid instead, and the helper answers it
 * with a held handle (see `foregroundHelper.ts`).
 *
 * This file is the part with no process in it: a state machine over samples
 * and liveness answers, returning the session that ended when one did.
 * Split out for the same reason `voteOver` came out of `dominantBetween`, and
 * it matters more here, because every rule below is a judgement about what a
 * person did and none of it is re-derivable from reading the code.
 *
 * ## The rules, and what each is for
 *
 * - **A game is whatever the caller says it is.** `isGame` is passed in and is
 *   the same test the attribution vote uses, so a session is over the same set
 *   of executables a clip gets filed under. Two definitions of "a game" in one
 *   codebase is how they drift.
 * - **Alive means playing, whatever is in front.** Alt-tabbing to a browser
 *   mid-match is not the end of anything.
 * - **Settle before firing.** A crash and a relaunch, an anti-cheat wrapper
 *   that re-execs, a launcher that starts the real game as a second process:
 *   each is a pid going away and another arriving seconds later. Waiting is
 *   the difference between one sweep and two.
 * - **A game that was already gone is not an ending.** Nothing is tracked
 *   until a game has actually been seen in front, so a boot into an empty
 *   desktop fires nothing.
 * - **`unknown` ends nothing.** It means the handle could never be opened, so
 *   nothing can be concluded, and concluding anyway would sweep in the middle
 *   of a match.
 */

/** What is being watched, if anything. */
export type SessionState =
  | { phase: 'idle' }
  /** A game is in front or has been, and its process is still alive. */
  | { phase: 'playing'; exePath: string; pid: number; since: number }
  /**
   * The process has gone, and this is the pause before believing it.
   *
   * `leftAt` is when it went, not when it will be believed, because the
   * session's clips end at the moment the game exited.
   */
  | { phase: 'settling'; exePath: string; pid: number; since: number; leftAt: number };

/** A session that has ended, and the window its clips fall in. */
export interface EndedSession {
  exePath: string;
  pid: number;
  /** When the game was first seen in front. */
  from: number;
  /** When its process went away. */
  to: number;
}

export interface SessionInput {
  /** The newest sample, or null on a tick with nothing new. */
  sample: ForegroundSample | null;
  /** What the helper says about the tracked pid, or null before it has said. */
  tracked: TrackedState | null;
  now: number;
  /** Whether an executable counts as a game. The attribution vote's own test. */
  isGame: (exePath: string) => boolean;
  /** How long to wait before believing an exit. */
  settleMs: number;
}

export interface SessionStep {
  state: SessionState;
  /** Set on the one tick where a session is judged to have ended. */
  ended?: EndedSession;
  /**
   * The pid the helper should be watching after this step.
   *
   * Returned rather than acted on, because acting is a write to a child
   * process and this file does not have one. Undefined means leave it alone.
   */
  track?: number;
}

export const IDLE: SessionState = { phase: 'idle' };

/** Same executable, whatever case the path came back in. */
function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * One tick of the machine.
 *
 * Pure: everything it knows arrives in `input`, and everything it wants done
 * comes back in the result.
 */
export function stepSession(state: SessionState, input: SessionInput): SessionStep {
  const { sample, tracked, now, isGame, settleMs } = input;
  const game = sample && sample.exePath && isGame(sample.exePath) ? sample : null;

  if (state.phase === 'idle') {
    // Nothing is being watched, so the only thing that can happen is a game
    // appearing. Its own sample time rather than `now`: the session started
    // when it was first seen, and the clips from it are dated by the clock.
    if (!game) return { state };
    return {
      state: { phase: 'playing', exePath: game.exePath, pid: game.pid, since: game.at },
      track: game.pid,
    };
  }

  if (state.phase === 'playing') {
    /*
     * A second game, while the first is still running.
     *
     * Two games at once is one of them minimised, and the one in front is the
     * one being played. Following it means the sweep fires for the session
     * that just ended rather than for whichever game was started first.
     */
    if (game && !same(game.exePath, state.exePath)) {
      return {
        state: { phase: 'playing', exePath: game.exePath, pid: game.pid, since: game.at },
        track: game.pid,
      };
    }

    // Alive, or nothing said yet. Either way there is nothing to conclude.
    if (tracked !== 'exited') return { state };

    return {
      state: {
        phase: 'settling',
        exePath: state.exePath,
        pid: state.pid,
        since: state.since,
        leftAt: now,
      },
    };
  }

  /*
   * Settling: the process has gone and the wait is on.
   *
   * The same executable coming back is a relaunch rather than two sessions,
   * and it keeps the original start so the window still covers everything
   * recorded either side of the restart. A *different* game arriving is a new
   * session, and it also means the first one really did end: it is reported
   * here rather than dropped, because those clips are exactly the ones worth
   * reading before the machine gets busy again.
   */
  if (game && same(game.exePath, state.exePath)) {
    return {
      state: { phase: 'playing', exePath: state.exePath, pid: game.pid, since: state.since },
      track: game.pid,
    };
  }

  if (game) {
    return {
      state: { phase: 'playing', exePath: game.exePath, pid: game.pid, since: game.at },
      track: game.pid,
      ended: { exePath: state.exePath, pid: state.pid, from: state.since, to: state.leftAt },
    };
  }

  if (now - state.leftAt < settleMs) return { state };

  return {
    state: IDLE,
    track: 0,
    ended: { exePath: state.exePath, pid: state.pid, from: state.since, to: state.leftAt },
  };
}
