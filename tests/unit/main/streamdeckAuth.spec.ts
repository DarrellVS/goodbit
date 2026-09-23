import { describe, expect, it } from 'vitest';
import { discardableFromAKey } from '../../../src/main/services/streamdeck/auth.js';
import { streamDeckPipeName } from '../../../src/main/services/streamdeck/pipe.js';

/**
 * The Stream Deck connection, and the rule a discard key has to pass.
 *
 * The connection is a named pipe now, so what is left to hold here is which
 * pipe a profile gets and what a key is allowed to throw away.
 */

describe('streamDeckPipeName', () => {
  it('is the plain name for the default profile, which an installed plugin assumes', () => {
    expect(streamDeckPipeName(undefined)).toBe(String.raw`\\.\pipe\goodbit-streamdeck`);
    expect(streamDeckPipeName(null)).toBe(streamDeckPipeName(''));
  });

  it('is its own for a moved profile, so a dev build never answers for the installed app', () => {
    const dev = streamDeckPipeName(String.raw`C:\Users\me\GoodBit-dev-test`);
    expect(dev).toMatch(/^\\\\\.\\pipe\\goodbit-streamdeck-[0-9a-f]{10}$/);
    expect(dev).not.toBe(streamDeckPipeName(undefined));
    expect(dev).not.toBe(streamDeckPipeName(String.raw`C:\Users\me\Other`));
  });

  it('ignores the case of the folder, as Windows does', () => {
    expect(streamDeckPipeName(String.raw`C:\A\B`)).toBe(streamDeckPipeName(String.raw`c:\a\b`));
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
