import { describe, expect, it } from 'vitest';
import {
  bearerMatches,
  checkRequest,
  discardableFromAKey,
} from '../../../src/main/services/streamdeck/auth.js';

/**
 * Who may reach the Stream Deck server.
 *
 * This reopens a port the internal API was moved off on purpose, so every
 * case here is a way for something that is not the plugin to drive a library
 * that holds the only copy of somebody's tags and notes.
 */

const PORT = 43111;
const TOKEN = 'a-token-that-is-long-enough-to-matter';
const expected = { token: TOKEN, port: PORT };

const good = {
  method: 'POST',
  host: `127.0.0.1:${PORT}`,
  authorization: `Bearer ${TOKEN}`,
};

describe('checkRequest', () => {
  it('lets the plugin through', () => {
    // The plugin is a Node process inside the Stream Deck app: no Origin.
    expect(checkRequest(good, expected)).toEqual({ ok: true });
    expect(checkRequest({ ...good, host: `localhost:${PORT}` }, expected)).toEqual({ ok: true });
  });

  it('refuses a request with no token, before anything else is looked at', () => {
    expect(checkRequest({ ...good, authorization: undefined }, expected)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('refuses the wrong token, and a token of the wrong shape', () => {
    expect(checkRequest({ ...good, authorization: 'Bearer nope' }, expected)).toMatchObject({
      status: 401,
    });
    expect(checkRequest({ ...good, authorization: TOKEN }, expected)).toMatchObject({
      status: 401,
    });
    expect(checkRequest({ ...good, authorization: `Basic ${TOKEN}` }, expected)).toMatchObject({
      status: 401,
    });
  });

  it('refuses a web page, even one holding the token', () => {
    // A browser always sends an Origin on a cross-origin request. The plugin
    // never does, so any foreign Origin is a page and is refused first.
    expect(
      checkRequest({ ...good, origin: 'https://evil.example' }, expected),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses DNS rebinding, where the Host is a name that now points here', () => {
    // A page on evil.example re-points its own name at 127.0.0.1, and its
    // request then arrives here with that name in the Host header.
    expect(checkRequest({ ...good, host: `evil.example:${PORT}` }, expected)).toMatchObject({
      status: 403,
    });
    expect(checkRequest({ ...good, host: undefined }, expected)).toMatchObject({ status: 403 });
  });

  it('refuses the right host on the wrong port', () => {
    expect(checkRequest({ ...good, host: '127.0.0.1:80' }, expected)).toMatchObject({
      status: 403,
    });
  });

  it('refuses every method but GET and POST', () => {
    expect(checkRequest({ ...good, method: 'DELETE' }, expected)).toMatchObject({ status: 405 });
    expect(checkRequest({ ...good, method: 'PUT' }, expected)).toMatchObject({ status: 405 });
  });

  it('refuses everything when no token has been made', () => {
    // An empty token must not mean "Bearer " with nothing after it gets in.
    expect(
      checkRequest({ ...good, authorization: 'Bearer ' }, { token: '', port: PORT }),
    ).toMatchObject({ status: 401 });
  });
});

describe('bearerMatches', () => {
  it('matches only the exact token', () => {
    expect(bearerMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(bearerMatches(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(bearerMatches(`Bearer ${TOKEN.slice(0, -1)}`, TOKEN)).toBe(false);
    expect(bearerMatches(undefined, TOKEN)).toBe(false);
  });
});

describe('discardableFromAKey', () => {
  const plain = { tagCount: 0, markCount: 0 };

  it('allows a clip nobody has written anything about', () => {
    expect(discardableFromAKey(plain)).toEqual({ ok: true });
  });

  it('refuses one somebody has already decided was worth keeping', () => {
    // The file goes to the Recycle Bin; the row does not come back. A key has
    // no room for the question `clipDeleteQuestion.ts` would ask, so a clip
    // carrying anything irrecoverable is simply not discardable from one.
    expect(discardableFromAKey({ ...plain, starred: true })).toMatchObject({ reason: 'starred' });
    expect(discardableFromAKey({ ...plain, displayName: 'The clutch' })).toMatchObject({
      reason: 'named',
    });
    expect(discardableFromAKey({ ...plain, notes: 'watch at 0:14' })).toMatchObject({
      reason: 'has notes',
    });
    expect(discardableFromAKey({ ...plain, tagCount: 1 })).toMatchObject({ reason: 'tagged' });
    expect(discardableFromAKey({ ...plain, markCount: 2 })).toMatchObject({ reason: 'marked' });
  });

  it('refuses a published clip, whose link somebody may already have', () => {
    expect(discardableFromAKey({ ...plain, published: true })).toMatchObject({
      reason: 'published',
    });
  });

  it('does not count whitespace as having written something', () => {
    expect(discardableFromAKey({ ...plain, notes: '   ', displayName: ' ' })).toEqual({ ok: true });
  });
});
