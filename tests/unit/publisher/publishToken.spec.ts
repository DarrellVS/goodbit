import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportTokenState, requireToken } from '../../../publisher/src/middlewares/requireToken.js';

/**
 * A publisher with no `PUBLISH_TOKEN` refuses every upload, and says so.
 *
 * The refusing half is deliberate and old: writing to the publisher is the one
 * thing on it that is not public, and a version of that which works until you
 * configure it is a version that is still unprotected a year later. What was
 * wrong is that nothing said so until somebody pressed Publish, weeks later,
 * and got a 503 that reads like a broken app rather than like a variable
 * nobody set. The repository's own `.env` is exactly that case: three
 * Cloudflare and base URL values, and no token.
 *
 * So both halves are asserted here: that the refusal still fails closed, and
 * that a publisher starting without a token says the variable's name out loud.
 * The second one is the fix, and it is the kind of thing that decays into a
 * silent log line again unless something checks.
 */

const ORIGINAL = process.env.PUBLISH_TOKEN;

/** What one boot wrote, whichever console method it used. */
function captureBoot(): string {
  const said: string[] = [];
  const collect = (...args: unknown[]): void => void said.push(args.map(String).join(' '));
  const warn = vi.spyOn(console, 'warn').mockImplementation(collect);
  const log = vi.spyOn(console, 'log').mockImplementation(collect);
  try {
    reportTokenState();
  } finally {
    warn.mockRestore();
    log.mockRestore();
  }
  return said.join('\n');
}

/** Enough of an Express response to see which answer came back. */
function fakeExchange(headers: Record<string, string> = {}) {
  const sent: { status?: number; body?: { code?: string; message?: string } } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body as { code?: string; message?: string };
      return this;
    },
  };
  const req = { header: (name: string) => headers[name.toLowerCase()] };
  const next = vi.fn();
  // The middleware only ever reaches `header`, `status` and `json`, and the
  // test is about which of the three answers it picks.
  requireToken(req as never, res as never, next);
  return { sent, next };
}

beforeEach(() => {
  delete process.env.PUBLISH_TOKEN;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PUBLISH_TOKEN;
  else process.env.PUBLISH_TOKEN = ORIGINAL;
});

describe('what a publisher with no token says at boot', () => {
  it('names the variable, what it does and where the rest is written down', () => {
    const said = captureBoot();

    expect(said).toContain('PUBLISH_TOKEN');
    // The consequence, in the words somebody would search for.
    expect(said).toMatch(/refuses every upload/i);
    // And a way out, rather than only the bad news.
    expect(said).toContain('openssl rand -base64 32');
    expect(said).toContain('https://darrellvs.github.io/goodbit/publisher.html');
  });

  it('is a block rather than a line, and the block closes', () => {
    const lines = captureBoot().split('\n');
    const rules = lines.filter((line) => /^#+$/.test(line));

    // Two full-width rules, and every line between them the same width as
    // they are. The box is sized from its own longest line, so a message
    // edited to be wider than the border is the thing this catches.
    expect(rules).toHaveLength(2);
    expect(rules[0]).toBe(rules[1]);
    const width = rules[0].length;
    const framed = lines.filter((line) => line.startsWith('# '));
    expect(framed.length).toBeGreaterThan(8);
    for (const line of framed) expect(line).toHaveLength(width);
  });

  it('says the opposite, briefly, when the token is there', () => {
    process.env.PUBLISH_TOKEN = 'a-long-random-string';
    const said = captureBoot();

    // One line, no block: the question this answers is "did my token reach
    // the container", which a stray quote or an unread env_file loses.
    expect(said.split('\n')).toHaveLength(1);
    expect(said).toMatch(/PUBLISH_TOKEN is set/);
    // And never the secret itself. This log is pasted into bug reports.
    expect(said).not.toContain('a-long-random-string');
  });
});

describe('what an upload gets while the token is missing', () => {
  it('is a 503 that names the variable, not a 401 about a wrong one', () => {
    const { sent, next } = fakeExchange({ authorization: 'Bearer anything' });

    expect(sent.status).toBe(503);
    expect(sent.body?.code).toBe('NO_TOKEN_CONFIGURED');
    expect(sent.body?.message).toContain('PUBLISH_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses even a request presenting an empty token', () => {
    process.env.PUBLISH_TOKEN = '   ';
    const { sent, next } = fakeExchange({ 'x-publish-token': '   ' });

    // Whitespace is not a secret. Trimmed to nothing on both sides, this is
    // the unconfigured case, and it must not compare equal to itself.
    expect(sent.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('what an upload gets once the token is set', () => {
  beforeEach(() => {
    process.env.PUBLISH_TOKEN = 'the-real-token';
  });

  it('passes a bearer header through', () => {
    const { sent, next } = fakeExchange({ authorization: 'Bearer the-real-token' });

    expect(next).toHaveBeenCalledOnce();
    expect(sent.status).toBeUndefined();
  });

  it('passes the header GoodBit sends when it is not a bearer', () => {
    const { next } = fakeExchange({ 'x-publish-token': 'the-real-token' });

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a wrong token, and one of a different length', () => {
    expect(fakeExchange({ authorization: 'Bearer nearly-the-real-token' }).sent.status).toBe(401);
    // Hashed before comparing, so `timingSafeEqual` is never handed two
    // buffers of different lengths, which throws rather than returning false.
    expect(fakeExchange({ 'x-publish-token': 'x' }).sent.status).toBe(401);
    expect(fakeExchange().sent.status).toBe(401);
  });
});
