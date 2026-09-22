import { describe, expect, it } from 'vitest';
import { visitorKey } from '../../../publisher/src/middlewares/rateLimits.js';

/**
 * Who one visitor is, behind a proxy.
 *
 * `req.ip` is the proxy for every request, so a limit keyed on it is one bucket
 * for the whole internet. These hold the order the headers are read in.
 */
function request(headers: Record<string, string>, ip = '172.17.0.1') {
  return { ip, header: (name: string) => headers[name.toLowerCase()] } as never;
}

describe('visitorKey', () => {
  it("prefers Cloudflare's own header", () => {
    expect(visitorKey(request({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('then the first forwarded hop, not the proxy', () => {
    expect(visitorKey(request({ 'x-forwarded-for': '198.51.100.1, 172.17.0.1' }))).toBe('198.51.100.1');
  });

  it('then the socket', () => {
    expect(visitorKey(request({}))).toBe('172.17.0.1');
  });

  it('groups an IPv6 household into one bucket', () => {
    const a = visitorKey(request({ 'cf-connecting-ip': '2001:db8:1:2::1' }));
    const b = visitorKey(request({ 'cf-connecting-ip': '2001:db8:1:2::ffff' }));
    expect(a).toBe(b);
  });
});
