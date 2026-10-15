import http from 'node:http';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main/services/localApi/routes.js', () => ({
  handleRoute: vi.fn(async (req: { route: string; body: unknown; sessionId: string | null }) => ({
    status: 200,
    json: { route: req.route, body: req.body, session: req.sessionId },
  })),
  currentCapabilities: () => [],
}));
vi.mock('../../../src/main/services/localApi/stream.js', () => ({
  subscribe: vi.fn(async () => ({ ok: false, error: 'too_many_streams' })),
  startStream: vi.fn(),
  stopStream: vi.fn(),
  subscriberCount: () => 0,
}));

import { isLocalApiPipeName } from '../../../src/shared/localApi';
import { saveSettings, loadSettings } from '../../../src/main/settings';
import { discoveryPath, readDiscovery, removeDiscovery, writeDiscovery } from '../../../src/main/services/localApi/discovery';
import { newLocalApiPipeName } from '../../../src/main/services/localApi/pipe';
import {
  localApiPipe,
  localApiRunning,
  settleLocalApiSetting,
  startLocalApi,
  stopLocalApi,
} from '../../../src/main/services/localApi/index';

function request(
  pipe: string,
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: pipe, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

afterEach(async () => {
  await stopLocalApi();
  saveSettings({ streamDeckEnabled: false });
});

describe('pipe names', () => {
  it('are ours and never repeat', () => {
    const a = newLocalApiPipeName();
    const b = newLocalApiPipeName();
    expect(isLocalApiPipeName(a)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('discovery file', () => {
  it('round trips, and reads as absent once removed', () => {
    const pipe = newLocalApiPipeName();
    const d = { api: 1, pipe, pid: 1234, app: 'GoodBit' as const, version: '1.0.0', startedAt: new Date().toISOString() };
    expect(writeDiscovery(d)).toBe(true);
    expect(readDiscovery()).toEqual(d);
    expect(existsSync(`${discoveryPath()}.tmp`)).toBe(false);
    removeDiscovery();
    expect(readDiscovery()).toBeNull();
    removeDiscovery();
  });
});

describe('settleLocalApiSetting', () => {
  it('takes the switch from the Stream Deck once, and leaves a decision alone', () => {
    saveSettings({ streamDeckEnabled: true, localApiEnabled: undefined, localApiAllowDiscard: undefined });
    settleLocalApiSetting();
    expect(loadSettings().localApiEnabled).toBe(true);
    expect(loadSettings().localApiAllowDiscard).toBe(false);
    saveSettings({ localApiEnabled: false });
    settleLocalApiSetting();
    expect(loadSettings().localApiEnabled).toBe(false);
  });
});

describe('server on a real pipe', () => {
  it('writes the discovery file last, answers, and removes it on stop', async () => {
    expect(await startLocalApi()).toBe(true);
    const pipe = localApiPipe();
    expect(pipe && isLocalApiPipeName(pipe)).toBe(true);
    expect(readDiscovery()?.pipe).toBe(pipe);
    expect(localApiRunning()).toBe(true);

    const ok = await request(pipe!, 'POST', '/v1/clips/star', '{"a":1}', { 'goodbit-session': 's1' });
    expect(ok.status).toBe(200);
    expect(ok.json.body).toEqual({ a: 1 });
    expect(ok.json.session).toBe('s1');

    await stopLocalApi();
    expect(readDiscovery()).toBeNull();
    expect(localApiRunning()).toBe(false);
    expect(localApiPipe()).toBeNull();
  });

  it('refuses a body over 4 KB, bad JSON, unknown routes, and a stream deck route while that switch is off', async () => {
    await startLocalApi();
    const pipe = localApiPipe()!;
    const big = await request(pipe, 'POST', '/v1/clips/star', JSON.stringify({ x: 'a'.repeat(5000) }));
    expect(big.status).toBe(413);
    expect(big.json.error).toBe('payload_too_large');
    const bad = await request(pipe, 'POST', '/v1/clips/star', '{nope');
    expect(bad.status).toBe(400);
    const none = await request(pipe, 'GET', '/v1/nothing');
    expect(none.status).toBe(404);
    saveSettings({ streamDeckEnabled: false });
    const legacy = await request(pipe, 'GET', '/v1/health');
    expect(legacy.status).toBe(404);
    saveSettings({ streamDeckEnabled: true });
    const legacyOn = await request(pipe, 'GET', '/v1/health');
    expect(legacyOn.status).toBe(200);
    const events = await request(pipe, 'GET', '/v1/events');
    expect(events.status).toBe(503);
  });

  it('does not start twice, and a second start is the same pipe', async () => {
    await startLocalApi();
    const first = localApiPipe();
    expect(await startLocalApi()).toBe(true);
    expect(localApiPipe()).toBe(first);
  });
});
