import { formatTime } from './timeFormat';

/**
 * Frames, from a frame rate the app was told rather than one it assumed.
 *
 * The trim page's whole problem is that the backend cuts to the frame and the
 * slider picks in tenths. One frame is only a duration if you know the frame
 * rate, and this library is 60 fps ultrawide capture, so assuming 30 would be
 * an off-by-half-a-frame control that looks exact. Everything here takes the
 * rate as an argument and everything here tolerates not having one: `null` fps
 * is a supported case, not an error, and it changes what the readout says so
 * that the format itself tells you how much the app knows.
 *
 * Values in, values out. `tests/unit/renderer/frameRate.spec.ts` covers it.
 */

/**
 * The band of frame rates worth believing, from ffprobe.
 *
 * `GetClipMetaAction` sends `avg_frame_rate` and falls back to
 * `r_frame_rate`, and the second of those is a *timebase* on some containers:
 * `90000/1` and `1000/1` both turn up in the wild for a stream whose rate is
 * unknown. Believing one would make a "frame" eleven microseconds long and the
 * arrow keys would do nothing visible. Real capture tops out at 240 or 360, so
 * 480 is generous and still rejects a timebase; the floor rejects `0/0`, which
 * is ffprobe's own way of saying it does not know.
 */
const MIN_FPS = 1;
const MAX_FPS = 480;

/**
 * A millionth of a frame, added before flooring a time into a frame index.
 *
 * It is load-bearing, and the number of misses is measured rather than
 * guessed. `frame / fps * fps` is not always `frame` in binary floating point,
 * and when it comes out a hair low the floor lands a whole frame early. Over
 * ten minutes of footage: 813 of 36,001 boundaries wrong at 60 fps, 952 at
 * 59.94, 1,849 at 50, 1,043 at 23.976. With the epsilon, zero at every rate
 * tried. It has to stay far below one frame (0.0167 s at 60 fps) and far above
 * the error it absorbs (about 1e-11 frames at the longest clip anybody has
 * here), and a millionth of a frame sits comfortably between the two.
 */
const FRAME_EPSILON = 1e-6;

/** The step the slider had before frames existed, and the fallback when the rate is unknown. */
export const TENTH_SEC = 0.1;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * ffprobe's rational, as a number, or `null` when it does not say.
 *
 * `60/1`, `60000/1001`, `30`, `0/0` and `N/A` all turn up. The last two mean
 * "unknown" and must come back as `null` rather than as `NaN` or `0`, because
 * every caller here branches on `null` to fall back to tenths.
 */
export function parseFrameRate(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else {
    const text = raw.trim();
    if (!text) return null;

    const slash = text.indexOf('/');
    if (slash === -1) {
      value = Number(text);
    } else {
      const top = Number(text.slice(0, slash));
      const bottom = Number(text.slice(slash + 1));
      // `0/0` is ffprobe saying it does not know, and `n/0` is not a number.
      if (!bottom) return null;
      value = top / bottom;
    }
  }

  if (!Number.isFinite(value)) return null;
  if (value < MIN_FPS || value > MAX_FPS) return null;
  return value;
}

/**
 * How many whole frames a clip of this length holds.
 *
 * The frames are numbered `0` to `frameCount - 1`; `frameCount` itself is the
 * boundary at the end of the last one, which is where a trim's end handle sits
 * when it is keeping everything.
 */
export function frameCount(durationSec: number, fps: number): number {
  if (!(durationSec > 0)) return 0;
  return Math.max(0, Math.floor(durationSec * fps + FRAME_EPSILON));
}

/**
 * Which frame is on screen at this moment.
 *
 * Frame `n` occupies `[n/fps, (n+1)/fps)`, so this floors rather than rounds:
 * a time one microsecond before a frame boundary is still the frame before it,
 * which is what the picture shows.
 */
export function frameAt(sec: number, fps: number): number {
  if (!(sec > 0)) return 0;
  return Math.max(0, Math.floor(sec * fps + FRAME_EPSILON));
}

/** Where frame `n` begins. A handle sits here, so the cut lands on a frame edge. */
export function frameStart(frame: number, fps: number): number {
  return Math.max(0, frame) / fps;
}

/**
 * The middle of frame `n`, which is where the playhead is asked to go.
 *
 * Never the boundary. `video.currentTime = n / fps` sits exactly on the seam
 * between two frames, and the element picks the frame whose interval contains
 * the time it is given: one ULP low, or a container whose real timestamps were
 * computed at a different precision, and it picks frame `n - 1` instead. Half
 * a frame of margin is the most that is available and it is the standard fix.
 */
export function frameCentre(frame: number, fps: number): number {
  return (Math.max(0, frame) + 0.5) / fps;
}

/**
 * Move a handle by whole frames, and land on a frame boundary.
 *
 * The step is taken on the frame *index*, not on the time: quantise, add an
 * integer, convert back. Repeating it cannot drift, because every intermediate
 * value is an integer and the round trip through `frameStart` and `frameAt` is
 * exact at every frame of a ten minute clip.
 *
 * The top of the range is `frameCount`, one past the last whole frame, and it
 * means the end of the recording rather than a frame boundary. Clamping a
 * handle to the last frame's *start* would quietly drop the final frame from
 * every trim that used to run to the end.
 *
 * That last position is `durationSec` itself and not `frameCount / fps`,
 * which is the same thing only when the clip holds a whole number of frames.
 * At 59.94 a thirty second recording holds 1798 whole frames and a part of one
 * more, so the boundary is 29.9966 and the end of the file is 30, and a handle
 * that could not reach the second of those could not keep the whole clip. The
 * unit suite found this; nothing on screen would have.
 */
export function stepToFrameStart(
  sec: number,
  delta: number,
  fps: number,
  durationSec: number,
): number {
  const total = frameCount(durationSec, fps);
  const frame = clamp(frameAt(sec, fps) + delta, 0, total);
  return frame >= total ? Math.max(0, durationSec) : frameStart(frame, fps);
}

/**
 * Move the playhead by whole frames, and land in the middle of one.
 *
 * Clamped to the last *frame*, not to the boundary after it: there is nothing
 * to see at the end of the file.
 */
export function stepToFrameCentre(
  sec: number,
  delta: number,
  fps: number,
  durationSec: number,
): number {
  const last = Math.max(0, frameCount(durationSec, fps) - 1);
  const frame = clamp(frameAt(sec, fps) + delta, 0, last);
  return clamp(frameCentre(frame, fps), 0, Math.max(0, durationSec));
}

/**
 * The same step, in tenths, for a clip whose frame rate nothing has reported.
 *
 * Quantised the same way and for the same reason: the grid is coarser, the
 * arithmetic is identical, and the readout beside it says tenths rather than
 * frames so nobody is told the control is more exact than it is.
 */
export function stepOnTenths(sec: number, delta: number, durationSec: number): number {
  const grid = Math.round(Math.max(0, sec) / TENTH_SEC) + delta;
  const time = Math.max(0, grid) * TENTH_SEC;
  return clamp(Math.round(time * 1000) / 1000, 0, Math.max(0, durationSec));
}

/**
 * `0:12:20`, the position to the frame.
 *
 * Non drop frame, which is to say the seconds and the frame field both come
 * from the frame index and the field wraps at the nominal rate. That is what
 * every editor shows, and the property that matters for a control you step
 * with is that one press always changes the last field by exactly one and the
 * wrap is clean.
 *
 * At 60 and at 30, the rates OBS is set up to record here, non drop is
 * identical to the clock. At 59.94 it runs 0.1% slow against it, which is two
 * frames over a thirty second clip and is what non drop timecode has always
 * cost.
 *
 * **Without a frame rate it falls back to hundredths**, `0:12.33`, which is
 * the format the rest of the app already uses. The colon against the full stop
 * is the only thing separating the two on screen, so the timeline prints the
 * frame rate next to the readouts, or says it does not have one.
 */
export function formatTimecode(sec: number, fps: number | null): string {
  if (fps === null) return formatTime(Math.max(0, sec || 0));

  const frame = frameAt(sec || 0, fps);
  const nominal = Math.max(1, Math.round(fps));
  const width = String(nominal - 1).length;

  const whole = Math.floor(frame / nominal);
  const ff = (frame % nominal).toString().padStart(Math.max(2, width), '0');
  const ss = (whole % 60).toString().padStart(2, '0');
  const minutes = Math.floor(whole / 60);

  if (minutes < 60) return `${minutes}:${ss}:${ff}`;

  const mm = (minutes % 60).toString().padStart(2, '0');
  return `${Math.floor(minutes / 60)}:${mm}:${ss}:${ff}`;
}

/**
 * How long a range is, counted in frames.
 *
 * The length of a trim is the one number on this page that is a count rather
 * than a position, and `0:00:18` for it reads like a position. `18 frames`
 * does not.
 */
export function frameSpanLabel(lengthSec: number, fps: number | null): string | null {
  if (fps === null) return null;

  const frames = Math.max(0, Math.round(Math.max(0, lengthSec) * fps));
  return `${frames} ${frames === 1 ? 'frame' : 'frames'}`;
}

/** `60 fps`, or `59.94 fps`, the way `ClipFacts` already writes it. */
export function frameRateLabel(fps: number | null): string | null {
  if (fps === null) return null;
  return `${Math.round(fps * 100) / 100} fps`;
}
