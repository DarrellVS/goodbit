import { timingSafeEqual } from 'node:crypto';

/**
 * Who may talk to the Stream Deck server, as pure functions.
 *
 * **This reopens a port on purpose**, after the internal API was moved off one
 * precisely because every other program on the machine could reach a port and
 * that API deletes clips. It is acceptable because the MCP server already
 * showed the honest way to do it, and this follows that precedent: bound to
 * `127.0.0.1`, a bearer token checked before anything else, and a Host and
 * Origin check, which the MCP server gets from its SDK and this one has to
 * write by hand.
 *
 * Kept apart from the server so `tests/unit/main/streamdeckAuth.spec.ts` owns
 * it. This is the one part of the feature where a bug is a security bug, and a
 * predicate over four strings is exactly what the unit suite is for.
 *
 * What the token is not: it lives in the plugin's own settings, so anything
 * already running as this user can read it. It stops web pages and other
 * machines, which is what a desktop app can honestly promise.
 */

export interface StreamDeckRequest {
  method: string;
  host?: string | undefined;
  origin?: string | undefined;
  authorization?: string | undefined;
}

export type AuthVerdict =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 405; error: string };

const METHODS = new Set(['GET', 'POST']);

/**
 * Whether a request may reach a handler.
 *
 * In this order, each for its own reason:
 *
 * 1. **Host**, which is what stops DNS rebinding. A page on `evil.example`
 *    that re-points its own name at `127.0.0.1` reaches this port with
 *    `Host: evil.example`; only our own two spellings are accepted.
 * 2. **Origin**, which a browser always sends on a cross-origin request and
 *    the plugin never does: it is a Node process inside the Stream Deck app,
 *    not a page. So any Origin at all that is not our own is a web page, and
 *    it is refused before the token is even looked at.
 * 3. **The token**, compared in constant time, because a comparison that
 *    returns early on the first wrong character tells a patient caller how
 *    many it got right.
 */
export function checkRequest(
  request: StreamDeckRequest,
  expected: { token: string; port: number },
): AuthVerdict {
  if (!METHODS.has(request.method.toUpperCase())) {
    return { ok: false, status: 405, error: 'GET or POST only' };
  }

  const hosts = new Set([`127.0.0.1:${expected.port}`, `localhost:${expected.port}`]);
  if (!request.host || !hosts.has(request.host.toLowerCase())) {
    return { ok: false, status: 403, error: 'Not a request to this machine' };
  }

  if (request.origin) {
    const origins = new Set([`http://127.0.0.1:${expected.port}`, `http://localhost:${expected.port}`]);
    if (!origins.has(request.origin.toLowerCase())) {
      return { ok: false, status: 403, error: 'Web pages may not reach GoodBit' };
    }
  }

  if (!expected.token || !bearerMatches(request.authorization, expected.token)) {
    return { ok: false, status: 401, error: 'GoodBit needs the token from Settings, Connections' };
  }

  return { ok: true };
}

/** `Bearer <token>`, compared without leaking how much of it matched. */
export function bearerMatches(header: string | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length), 'utf-8');
  const wanted = Buffer.from(token, 'utf-8');
  // `timingSafeEqual` throws on a length mismatch, and the length is not a
  // secret worth protecting: every token this app makes is the same length.
  if (given.length !== wanted.length) return false;
  return timingSafeEqual(given, wanted);
}

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
