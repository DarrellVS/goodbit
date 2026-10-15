import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_API_LIMITS } from '@shared/localApi';
import {
  MAX_SESSIONS,
  closeSession,
  getSession,
  openSession,
  requireSession,
  sessionCount,
  sweepSessions,
} from '../../../src/main/services/localApi/session';

const T0 = 1_000_000;
const ttl = LOCAL_API_LIMITS.sessionTtlMs;

afterEach(() => {
  // Everything opened at T0 is dead long before this.
  sweepSessions(T0 + ttl * 1000);
});

describe('session table', () => {
  it('opens sessions with unguessable distinct ids', () => {
    const a = openSession(T0);
    const b = openSession(T0);
    expect(a).toMatch(/^s_[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(getSession(a, T0)).not.toBeNull();
  });

  it('knows nothing for a null, unknown or expired id', () => {
    const id = openSession(T0);
    expect(getSession(null, T0)).toBeNull();
    expect(getSession('s_nope', T0)).toBeNull();
    expect(getSession(id, T0 + ttl)).toBeNull();
  });

  it('answers 401 session_required without a live session', () => {
    const missing = requireSession(null, T0);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.status).toBe(401);
      expect(missing.body.error).toBe('session_required');
    }
    const id = openSession(T0);
    expect(requireSession(id, T0 + ttl).ok).toBe(false);
  });

  it('touching on use keeps a session alive past its first ttl', () => {
    const id = openSession(T0);
    expect(requireSession(id, T0 + ttl - 1).ok).toBe(true);
    expect(getSession(id, T0 + ttl + 1000)).not.toBeNull();
    expect(getSession(id, T0 + ttl - 1 + ttl)).toBeNull();
  });

  it('getSession does not count as use', () => {
    const id = openSession(T0);
    expect(getSession(id, T0 + ttl - 1)).not.toBeNull();
    expect(getSession(id, T0 + ttl)).toBeNull();
  });

  it('holds what a session was sent, per session', () => {
    const a = openSession(T0);
    const b = openSession(T0);
    const ra = requireSession(a, T0);
    const rb = requireSession(b, T0);
    if (!ra.ok || !rb.ok) throw new Error('sessions should be live');
    ra.seen.rememberClips([7]);
    expect(ra.seen.knowsClip(7, T0)).toBe(true);
    expect(rb.seen.knowsClip(7, T0)).toBe(false);
  });

  it('sweeps only the expired and counts them', () => {
    const old = openSession(T0);
    const fresh = openSession(T0 + ttl);
    expect(sweepSessions(T0 + ttl)).toBeGreaterThanOrEqual(1);
    expect(getSession(old, T0)).toBeNull();
    expect(getSession(fresh, T0 + ttl)).not.toBeNull();
  });

  it('closeSession forgets one', () => {
    const id = openSession(T0);
    closeSession(id);
    expect(getSession(id, T0)).toBeNull();
    closeSession('s_never_existed');
  });

  it('never holds more than the ceiling, dropping the least recently used', () => {
    sweepSessions(T0 + ttl * 1000);
    const first = openSession(T0);
    for (let i = 0; i < MAX_SESSIONS; i += 1) openSession(T0);
    expect(sessionCount()).toBeLessThanOrEqual(MAX_SESSIONS);
    expect(getSession(first, T0)).toBeNull();
  });
});
