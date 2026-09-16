/**
 * What a GoodBit is allowed to be, and what to call the file one renders to.
 *
 * Deliberately a module of its own, with no imports: the database, ffmpeg and
 * `electron` are all one import away from an action, and none of them is needed
 * to answer "is 4.5 to 12.8 a range inside a 30 second clip". So this part is
 * values in, values out, and `tests/unit/main/goodBits.spec.ts` covers it
 * without a library, a window or a GPU.
 */

/**
 * The shortest GoodBit worth storing, in seconds.
 *
 * The table's own `CHECK (endSec > startSec)` only refuses zero and backwards,
 * so without this a stray click could store a five millisecond range: shorter
 * than a frame at any rate this app sees, impossible to see on a timeline, and
 * unrenderable, since `TrimVideoAction` floors a cut at 0.05s and would hand
 * back a file of nothing. One `ebur128` hop is the smallest thing the rest of
 * the app can talk about, so that is the floor.
 */
export const MIN_GOOD_BIT_SEC = 0.1;

/**
 * How far past the stored duration an end point may sit before it is refused.
 *
 * `Clip.durationSec` comes from the container's own header via one cheap
 * `probeDurationSec`, and a `<video>` element reports its own idea of the same
 * number; the two differ by a frame or two on the recordings here. Refusing a
 * GoodBit that ends on the last frame because of that would be a bug nobody
 * could work around, so an end inside this much slack is clamped to the
 * duration rather than rejected. Anything further out is a caller sending
 * nonsense and is told so.
 */
export const END_SLACK_SEC = 0.5;

/**
 * A range the clip cannot hold, with a sentence saying why.
 *
 * Carries `status` because `middlewares/errorHandler.ts` reads it, and because
 * the alternative was letting SQLite's `CHECK` constraint surface as a 500 with
 * "SQLITE_CONSTRAINT: CHECK constraint failed" in it, which tells the person
 * marking a clip nothing at all.
 */
export class GoodBitRangeError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'GoodBitRangeError';
  }
}

export type RangeCheck =
  | { ok: true; startSec: number; endSec: number }
  | { ok: false; error: string };

/** Whole milliseconds, which is as fine as a cut is ever asked for. */
function ms(seconds: number): number {
  return Math.round(seconds * 1000);
}

/**
 * Whether a range sits inside the clip, and what to store for it.
 *
 * `durationSec` is optional because it is nullable on `Clip`: the scan fills it
 * in, so a row written before that column existed has not been probed yet. With
 * no duration to check against, the range is taken on trust rather than probed
 * here, since a clip's length is stored and not probed (CLAUDE.md), and the
 * next scan will fill it in.
 */
export function checkRange(input: {
  startSec: number;
  endSec: number;
  durationSec?: number | null;
}): RangeCheck {
  const { startSec, endSec, durationSec } = input;

  // A JSON body is unchecked, so `Number(undefined)` and `Number('abc')` both
  // arrive here as NaN, and every comparison below would quietly answer false.
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    return { ok: false, error: 'a GoodBit needs a start and an end, in seconds' };
  }

  if (startSec < 0) {
    return { ok: false, error: 'a GoodBit cannot start before the clip does' };
  }

  /*
   * Compared as whole milliseconds, not as the seconds that arrived.
   *
   * `0.3 - 0.2` is 0.09999999999999998 in binary floating point, so marking
   * 0.2 to 0.3 on a floor of 0.1 fails a subtraction and nothing a person
   * could see. Rounding to the millisecond first, which is the precision the
   * range is stored and cut at anyway, puts both sides of the comparison on
   * the same grid as the answer.
   */
  const startMs = ms(startSec);
  const endMs = ms(endSec);
  if (endMs - startMs < ms(MIN_GOOD_BIT_SEC)) {
    return {
      ok: false,
      error: `a GoodBit has to be at least ${MIN_GOOD_BIT_SEC} seconds long`,
    };
  }

  const length = durationSec && durationSec > 0 ? durationSec : null;
  if (length !== null) {
    if (startSec >= length) {
      return { ok: false, error: 'a GoodBit cannot start after the clip ends' };
    }
    if (endSec > length + END_SLACK_SEC) {
      return { ok: false, error: 'a GoodBit cannot end after the clip does' };
    }
  }

  return {
    ok: true,
    startSec: startMs / 1000,
    // Inside the slack, so this is the last frame rather than an error.
    endSec: (length !== null ? Math.min(endMs, ms(length)) : endMs) / 1000,
  };
}

/** The same check, for a caller that would only rethrow. */
export function requireRange(input: {
  startSec: number;
  endSec: number;
  durationSec?: number | null;
}): { startSec: number; endSec: number } {
  const checked = checkRange(input);
  if (!checked.ok) throw new GoodBitRangeError(checked.error);
  return { startSec: checked.startSec, endSec: checked.endSec };
}

/** `74.6` as `1m14s`, for a filename, which cannot hold a colon on Windows. */
export function stamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, '0')}s`;
}

/**
 * What to call the file a GoodBit renders to, without its extension.
 *
 * Built from the source's own filename, so the two sort together in a folder
 * and it is obvious at a glance which recording a render came out of. Clips are
 * never renamed, and this is a new file rather than a rename, so naming it is
 * allowed; the GoodBit's own name goes on the row as `displayName` as well,
 * which is what the library shows.
 *
 * Every character Windows rejects in a path is stripped, along with trailing
 * dots, which it also rejects. A GoodBit with no name falls back to its
 * position in the clip, because "MyClip - MyClip" says nothing and a bare
 * "MyClip" would collide with the recording itself.
 */
export function renderBasename(input: {
  stem: string;
  name?: string | null;
  startSec: number;
  endSec: number;
}): string {
  const clean = (value: string): string =>
    value
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/, '')
      .trim();

  const stem = clean(input.stem).slice(0, 100);
  const named = clean(input.name ?? '').slice(0, 60);
  const suffix = named || `${stamp(input.startSec)}-${stamp(input.endSec)}`;

  return stem ? `${stem} - ${suffix}` : suffix;
}
