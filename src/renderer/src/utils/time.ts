/**
 * A clock reading for a clip, `m:ss`.
 *
 * Not `useFrameStep`'s `timecode`, which is frame accurate and needs a frame
 * rate to be: that one exists so the trimmer can say which frame a handle is
 * on. A player's readout and a hover preview want the plain clock, and they
 * want the same one, which is why this is here rather than written out in each
 * of them.
 *
 * Anything that is not a real, positive number reads as `0:00` rather than
 * `NaN:aN`, which is what a `<video>` reports before its metadata arrives.
 */
export function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
