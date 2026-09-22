import streamDeck from '@elgato/streamdeck';

/**
 * The one place this plugin talks to GoodBit.
 *
 * GoodBit listens on `127.0.0.1` behind a bearer token, off until somebody
 * switches it on in Settings, Connections. The address and the token are
 * pasted into this plugin's global settings once and shared by every key.
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

async function connection(): Promise<{ url: string; token: string }> {
  const settings = await streamDeck.settings.getGlobalSettings<GoodBitSettings>();
  return {
    url: (settings.url || DEFAULT_URL).replace(/\/$/, ''),
    token: settings.token || '',
  };
}

export async function goodbit(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
