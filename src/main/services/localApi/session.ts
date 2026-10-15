/**
 * OWNER: actions.
 *
 * Sessions: a table of `SessionSeen` by id. "An id is accepted only if GoodBit
 * sent it on that session": this is where that is asked.
 *
 * May import: `@shared/localApi`, node built-ins. Nothing from the other localApi files.
 * Imported by: `routes.ts`, `stream.ts` (`openSession`, `getSession`).
 *
 * A session comes from `GET /v1/events` or `GET /v1/state` and lives 10 minutes
 * after last use. Ids are random and unguessable (`s_` plus hex).
 */
import { randomBytes } from 'node:crypto';
import { errorBody, SessionSeen, type LocalApiErrorBody } from '@shared/localApi';

/**
 * A ceiling, so a client that opens a session per request cannot grow the
 * table for ever between sweeps. Past it the least recently used goes.
 */
export const MAX_SESSIONS = 256;

const sessions = new Map<string, SessionSeen>();

/** Create a session and return its id. */
export function openSession(now: number = Date.now()): string {
  if (sessions.size >= MAX_SESSIONS) {
    sweepSessions(now);
    // Map iterates in insertion order and a used session is re-inserted, so the first is the stalest.
    while (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next();
      if (oldest.done) break;
      sessions.get(oldest.value)?.expire();
      sessions.delete(oldest.value);
    }
  }
  let id = `s_${randomBytes(16).toString('hex')}`;
  while (sessions.has(id)) id = `s_${randomBytes(16).toString('hex')}`;
  sessions.set(id, new SessionSeen(now));
  return id;
}

/** The live session, or null for none, unknown or expired. Does not touch it. */
export function getSession(id: string | null, now: number = Date.now()): SessionSeen | null {
  if (!id) return null;
  const seen = sessions.get(id);
  if (!seen) return null;
  if (seen.isExpired(now)) return null;
  return seen;
}

/** The session for a request, touched; or the 401 `session_required` body to answer with. */
export function requireSession(
  id: string | null,
  now: number = Date.now(),
): { ok: true; seen: SessionSeen } | { ok: false; status: 401; body: LocalApiErrorBody } {
  const seen = getSession(id, now);
  if (!seen || id === null) {
    return {
      ok: false,
      status: 401,
      body: errorBody('session_required', 'Open a session with GET /v1/state or GET /v1/events first.'),
    };
  }
  seen.touch(now);
  // Re-insert so the table stays ordered by last use.
  sessions.delete(id);
  sessions.set(id, seen);
  return { ok: true, seen };
}

/** Drop sessions past their ttl. Called on a timer by whoever owns one. Returns how many went. */
export function sweepSessions(now: number = Date.now()): number {
  let gone = 0;
  for (const [id, seen] of sessions) {
    if (seen.isExpired(now)) {
      seen.expire();
      sessions.delete(id);
      gone += 1;
    }
  }
  return gone;
}

/** Forget a session, for a stream that ended. */
export function closeSession(id: string): void {
  sessions.get(id)?.expire();
  sessions.delete(id);
}

/** How many sessions are held. For tests and diagnostics. */
export function sessionCount(): number {
  return sessions.size;
}
