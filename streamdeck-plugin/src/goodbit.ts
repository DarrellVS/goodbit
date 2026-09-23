import streamDeck from '@elgato/streamdeck';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The one place this plugin talks to GoodBit.
 *
 * GoodBit listens on `127.0.0.1` behind a bearer token, off until somebody
 * switches it on in Settings, Connections.
 *
 * **Where the address and token come from.** GoodBit's *Install the plugin*
 * button writes them into `connection.json` in this plugin's own folder, so
 * nobody has to paste a forty character token. What is pasted into a key's
 * settings wins over the file, so a hand-set connection is never overwritten
 * by a GoodBit that happens to be running a different profile.
 *
 * **Every call has a short timeout.** A key that waits thirty seconds for an
 * app that is not running looks exactly like a broken key, so after four
 * seconds it gives up and shows the alert triangle instead.
 */

export interface GoodBitSettings {
  [key: string]: string | undefined;
  url?: string;
  token?: string;
}

export interface GoodBitReply {
  status: number;
  body: Record<string, unknown>;
}

const DEFAULT_URL = 'http://127.0.0.1:43120';
const TIMEOUT_MS = 4000;

/** `connection.json`, written by GoodBit beside `bin/`. Read on every press, so a new token is picked up at once. */
function fromFile(): GoodBitSettings {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, '..', 'connection.json'), 'utf-8')) as GoodBitSettings;
  } catch {
    return {};
  }
}

async function connection(): Promise<{ url: string; token: string }> {
  const settings = await streamDeck.settings.getGlobalSettings<GoodBitSettings>();
  const file = fromFile();
  return {
    url: (settings.url || file.url || DEFAULT_URL).replace(/\/$/, ''),
    token: settings.token || file.token || '',
  };
}

export async function goodbit(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<GoodBitReply> {
  const { url, token } = await connection();
  if (!token) return { status: 0, body: { error: 'No token set' } };

  try {
    const response = await fetch(`${url}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      /* no body */
    }
    return { status: response.status, body };
  } catch (error) {
    // Not running, switched off, or the wrong port. All read the same from a
    // key, and the log says which.
    streamDeck.logger.warn(`GoodBit did not answer: ${(error as Error).name}`);
    return { status: 0, body: { error: 'GoodBit is not listening' } };
  }
}

/** Whether a reply means the thing worked. 202 counts: publishing runs on. */
export const succeeded = (reply: GoodBitReply): boolean =>
  reply.status >= 200 && reply.status < 300;
