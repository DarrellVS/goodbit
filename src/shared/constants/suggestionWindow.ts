/**
 * How much of a clip to keep around a moment, in seconds.
 *
 * These two numbers decide where a suggested cut opens and closes, and where a
 * GoodBit made from a detected reading starts and ends. Both processes have to
 * agree, or pressing "Use it" and pressing a suggestion chip put the handles in
 * two different places for the same moment.
 *
 * They lived in `src/main/actions/AnalyzeClipAction.ts`, which the renderer
 * cannot import from, so `utils/goodBits.ts` restated them as
 * `ANCHOR_LEAD_SEC` and `ANCHOR_TAIL_SEC` with a comment saying they matched.
 * A comment is not a constraint: two copies of a measured number drift the
 * first time somebody retunes one, and nothing fails when they do.
 */

/**
 * How far to start before the loud part.
 *
 * What the sound marks is the *reaction*. The explosion, the shout, the
 * killfeed: the thing that caused it already happened. Cutting exactly on the
 * spike drops the shot that led to it, so the window opens a beat earlier.
 */
export const LEAD_IN = 2.5;

/** Keep this much after the peak, so the payoff is not cut off. */
export const TAIL_ROOM = 1.5;
