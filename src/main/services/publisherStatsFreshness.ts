/**
 * Whether the mirrored view counts are old enough to ask the publisher again.
 *
 * The library asks every time it is opened and every time the window comes
 * back into focus, which is often. One clock in main, shared by boot, the
 * Publisher screen and the library, turns that into at most one request per
 * window, and a burst of navigation into none at all.
 *
 * An attempt counts, not only a success: a publisher that is switched off is
 * asked once per window rather than on every alt-tab.
 *
 * Pure so `tests/unit` owns it; the clock lives in the action.
 */
export function statsAreStale(lastAttemptAt: number | null, now: number, maxAgeMs: number): boolean {
  if (lastAttemptAt == null) return true;
  // A clock that went backwards (a sleep, a manual change) is not "fresh for
  // ever": treat it as stale rather than trusting a negative age.
  const age = now - lastAttemptAt;
  return age < 0 || age >= maxAgeMs;
}
