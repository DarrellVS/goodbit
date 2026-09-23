/**
 * The rule a discard key has to pass, as a pure function.
 *
 * This file used to hold who may talk to the Stream Deck server at all: a
 * bearer token, and Host and Origin checks for a port on loopback. The server
 * is on a named pipe now, which a browser cannot reach and Windows only lets
 * this account write to, so those went (see `pipe.ts`). What is left is the
 * part where a bug would cost somebody a clip, which `tests/unit` owns.
 */
/**
 * Whether a clip may be thrown away from a physical key.
 *
 * **A key pressed mid-game by somebody not looking at a screen.** The file goes
 * to the Recycle Bin and can be fetched back; the row cannot, so its tags,
 * notes, name, stars and marks are gone with it. That is the argument
 * `clipDeleteQuestion.ts` exists to make, and a key has no room for the
 * question.
 *
 * So the server only discards a clip nobody has written anything about. One
 * that carries anything irrecoverable is refused, and the key says so: at that
 * point somebody has already decided the clip was worth keeping, and a stray
 * press should not be able to undo that decision.
 */
export function discardableFromAKey(clip: {
  displayName?: string | null;
  notes?: string | null;
  starred?: boolean;
  tagCount: number;
  markCount: number;
  published?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (clip.starred) return { ok: false, reason: 'starred' };
  if (clip.published) return { ok: false, reason: 'published' };
  if (clip.displayName?.trim()) return { ok: false, reason: 'named' };
  if (clip.notes?.trim()) return { ok: false, reason: 'has notes' };
  if (clip.tagCount > 0) return { ok: false, reason: 'tagged' };
  if (clip.markCount > 0) return { ok: false, reason: 'marked' };
  return { ok: true };
}
