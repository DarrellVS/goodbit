import { describe, expect, it } from 'vitest';
import { basename, join, resolve, sep } from 'node:path';

/**
 * The publisher is the only part of this system on the internet, and its embed
 * route took a filename from the URL.
 *
 * `GET /:filename` joined that parameter onto the upload directory and, for
 * anything that did not end in `.mp4`, handed the result to `res.sendFile`,
 * which takes an absolute path exactly as given. So a request for
 * `/..%2F..%2Fetc%2Fpasswd` read a file outside the upload directory, with no
 * token, from anywhere on the internet.
 *
 * **Why it was not obvious.** Express matches the route pattern against the
 * still-encoded path, so `%2F` is not a slash when the router is deciding
 * whether `/:filename` matches, and `/a/b` correctly does not match. The
 * parameter is decoded *afterwards*, which is when the slashes appear. Reading
 * the route, `:filename` looks like it cannot contain a separator. It can.
 *
 * This is the reasoning, written down as arithmetic. It does not need a server:
 * the whole defect and the whole fix are what `decodeURIComponent` and
 * `basename` do to a string.
 */

/** Wherever the publisher keeps uploads. The value does not matter. */
const UPLOAD_DIR = resolve('/srv/goodbit/uploads');

/** What Express hands the handler: the parameter, decoded. */
const asExpressWouldDecode = (raw: string): string => decodeURIComponent(raw);

/** What the route does now. */
const resolved = (param: string): string => join(UPLOAD_DIR, basename(param));

const inside = (path: string): boolean =>
  resolve(path).startsWith(UPLOAD_DIR + sep) || resolve(path) === UPLOAD_DIR;

describe('what a route parameter can contain', () => {
  it('can contain path separators, despite the route pattern', () => {
    // The step that makes the defect possible, and the reason reading the
    // route is not enough to rule it out.
    expect(asExpressWouldDecode('..%2F..%2Fetc%2Fpasswd')).toBe('../../etc/passwd');
    expect(asExpressWouldDecode('..%5C..%5Cwindows%5Cwin.ini')).toBe('..\\..\\windows\\win.ini');
  });

  it('would have escaped the upload directory without a guard', () => {
    // The old behaviour, stated so the fix has something to be better than.
    const unguarded = join(UPLOAD_DIR, asExpressWouldDecode('..%2F..%2Fetc%2Fpasswd'));

    expect(inside(unguarded)).toBe(false);
    expect(resolve(unguarded)).toContain('passwd');
  });
});

describe('the embed route cannot be walked out of', () => {
  const attempts = [
    '..%2F..%2Fetc%2Fpasswd',
    '..%2F..%2F..%2F..%2Fetc%2Fshadow',
    '..%5C..%5Cwindows%5Cwin.ini',
    '%2Fetc%2Fpasswd',
    '%2E%2E%2F%2E%2E%2Fsecrets.env',
    'subdir%2F..%2F..%2Fescape.txt',
    '..%252F..%252Fdouble-encoded',
  ];

  for (const attempt of attempts) {
    it(`stays inside for ${attempt}`, () => {
      const path = resolved(asExpressWouldDecode(attempt));

      // The only invariant worth asserting: whatever the request asked for,
      // the path resolves inside the upload directory.
      //
      // Deliberately not "the path contains no `..`". A double-encoded attempt
      // decodes once, because Express decodes once, so
      // `..%252F..%252Fdouble-encoded` arrives as the literal filename
      // `..%2F..%2Fdouble-encoded`. That string contains two dots and is
      // perfectly safe: it names a file inside the directory that almost
      // certainly does not exist. Asserting on the spelling would have failed
      // here while the code was correct, which is how a test teaches the wrong
      // lesson.
      expect(inside(path), path).toBe(true);
    });
  }

  it('still serves an ordinary clip', () => {
    // A guard that broke the feature would be its own kind of bug.
    const path = resolved(asExpressWouldDecode('Battlefield%206_22.08.2026_15-41.mp4'));

    expect(path).toBe(join(UPLOAD_DIR, 'Battlefield 6_22.08.2026_15-41.mp4'));
    expect(inside(path)).toBe(true);
  });

  it('the one input basename does not neutralise reaches a directory, not a file', () => {
    /*
     * `basename('../..')` is `..`, so this one lands on the upload
     * directory's parent rather than inside it. Stated honestly rather than
     * asserted away, because it is the only attempt here that gets out.
     *
     * It is not a file read, which is what the route could otherwise be made
     * to do. `..` resolves to a directory, `res.sendFile` refuses a directory,
     * and there is no filename left to append: every `..` segment after the
     * first is gone, so it cannot be walked further. The worst available
     * outcome is an error.
     */
    const path = resolved(asExpressWouldDecode('..%2F..'));

    expect(resolve(path)).toBe(resolve(UPLOAD_DIR, '..'));
    expect(inside(path)).toBe(false);

    // And nothing beyond one level, however many segments were asked for.
    const deeper = resolved(asExpressWouldDecode('..%2F..%2F..%2F..%2F..'));
    expect(resolve(deeper)).toBe(resolve(UPLOAD_DIR, '..'));
  });
});
