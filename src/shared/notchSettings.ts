/**
 * What the notch is allowed to do, worked out once.
 *
 * Main decides what to draw from this and Settings decides what to show from
 * it, and two copies of these rules is how the screen that describes the
 * notch ends up describing a different one from the notch that appears. Same
 * reason `planAudioTracks` lives in `src/shared`.
 *
 * ## The keys, and why the old ones kept their names
 *
 * The notch replaced the corner card that said a clip was saved. Its switches
 * (`clipToast`, `clipToastSound`, `clipToastVolume`, `analyzeOnGameCloseToast`,
 * `analyzeOnGameCloseSound`) now steer the notch's peek instead, under the
 * same names. Renaming them would need a migration in `settings.json`, and an
 * older build that no longer finds the key it knows would read it as unset
 * and switch the card back on for somebody who had turned it off.
 * `clipToastCorner` is simply no longer read.
 *
 * Two keys are new: `notch`, the switch for the whole thing, and
 * `notchAlwaysOn`, the status line that stays on the desktop between peeks.
 *
 * ## What `notch` means before anybody has set it
 *
 * Not plainly `true`. Somebody who switched the corner card off said "draw
 * nothing over my screen", and an update that answered that with a line at
 * the top of every screen would be ignoring them. So an unset `notch` follows
 * `clipToast`: on for a new install and for anybody who had the card, off for
 * anybody who had turned it off.
 *
 * **Main writes that answer down at the first boot that sees it unset**
 * (`settleNotchSetting`), rather than leaving it derived. Left derived, the
 * notch would follow `clipToast` for ever, and switching off "say when a clip
 * is saved" would take the status line and the whole notch down with it.
 *
 * `notchAlwaysOn` is never derived: unset means on, so switching the notch on
 * brings the line with it.
 */

/** The settings this reads. Structural, so main's and the renderer's types both fit. */
export interface NotchSettingsInput {
  notch?: boolean;
  notchDwellMs?: number;
  notchLeaveMs?: number;
  notchAlwaysOn?: boolean;
  clipToast?: boolean;
  clipToastSound?: boolean;
  analyzeOnGameClose?: boolean;
  analyzeOnGameCloseToast?: boolean;
  analyzeOnGameCloseSound?: boolean;
}

export interface NotchPlan {
  /** The whole notch. Off draws nothing anywhere, ever. */
  enabled: boolean;
  /** The status line on the desktop, between peeks. */
  line: boolean;
  /** Open with "Saving your clip", then "Clip saved". */
  clipPeek: boolean;
  clipSound: boolean;
  /** Open with what a session's sweep is doing and what it found. */
  sweepPeek: boolean;
  sweepSound: boolean;
  /**
   * The notch is on and nothing it can do is switched on, so it will never be
   * seen. Settings says so rather than letting it look broken.
   */
  invisible: boolean;
}

/**
 * How long the pointer rests on the line before the notch opens.
 *
 * A setting because it is a matter of hand and habit: somebody who throws the
 * pointer at the top of the screen to look wants it near instant, somebody who
 * keeps a maximised browser's tabs there wants a little more wait before the
 * island covers them. Clamped, so a hand-edited `settings.json` cannot make it
 * negative or leave the notch effectively unopenable.
 */
export const NOTCH_DWELL = { default: 130, min: 0, max: 800, step: 10 } as const;

/**
 * How long the pointer can be off the open island before it folds.
 *
 * The other half of the same habit. A grace lets somebody overshoot a button by
 * a few pixels without losing the island; somebody who wants it gone the moment
 * they look away wants none.
 */
export const NOTCH_LEAVE = { default: 320, min: 0, max: 1500, step: 10 } as const;

function clamped(value: unknown, range: { default: number; min: number; max: number }): number {
  const n = Number(value);
  if (value === undefined || value === null || !Number.isFinite(n)) return range.default;
  return Math.round(Math.min(range.max, Math.max(range.min, n)));
}

export function notchDwellMs(settings: NotchSettingsInput): number {
  return clamped(settings.notchDwellMs, NOTCH_DWELL);
}

export function notchLeaveMs(settings: NotchSettingsInput): number {
  return clamped(settings.notchLeaveMs, NOTCH_LEAVE);
}

export function notchEnabled(settings: NotchSettingsInput): boolean {
  return settings.notch ?? settings.clipToast !== false;
}

export function resolveNotch(settings: NotchSettingsInput): NotchPlan {
  const enabled = notchEnabled(settings);
  const line = enabled && settings.notchAlwaysOn !== false;
  const clipPeek = enabled && settings.clipToast !== false;
  const sweepPeek =
    enabled && settings.analyzeOnGameClose !== false && settings.analyzeOnGameCloseToast !== false;

  return {
    enabled,
    line,
    clipPeek,
    clipSound: clipPeek && settings.clipToastSound !== false,
    sweepPeek,
    sweepSound: sweepPeek && settings.analyzeOnGameCloseSound !== false,
    invisible: enabled && !line && !clipPeek && !sweepPeek,
  };
}
