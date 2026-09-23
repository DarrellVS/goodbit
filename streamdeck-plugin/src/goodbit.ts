import streamDeck from '@elgato/streamdeck';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The one place this plugin talks to GoodBit.
 *
 * **Over a named pipe, with no token.** GoodBit serves its Stream Deck API on
 * `\\.\pipe\goodbit-streamdeck`, which a browser cannot reach and Windows only
 * lets the signed-in account write to, so there is nothing to paste and
 * nothing secret to keep. It is still HTTP, spoken over the pipe with
 * `socketPath`, so the routes and replies are the ones they always were.
 *
 * **Which pipe.** GoodBit writes `connection.json` beside `bin/` when it
 * installs this plugin and whenever its server starts, naming the pipe for
 * the profile it runs; a dev build beside the installed app has its own.
 * Without the file this uses the installed app's pipe.
 *
 * **Every call has a short timeout.** A key that waits thirty seconds for an
 * app that is not running looks exactly like a broken key, so after four
 * seconds it gives up and shows the alert triangle instead.
 */

export interface GoodBitReply {
  status: number;
  body: Record<string, unknown>;
}

const DEFAULT_PIPE = String.raw`\\.\pipe\goodbit-streamdeck`;
const TIMEOUT_MS = 4000;

/** Read on every press, so a GoodBit started on another profile is picked up at once. */
function pipe(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const file = JSON.parse(readFileSync(join(here, '..', 'connection.json'), 'utf-8')) as {
      pipe?: string;
    };
    return file.pipe || DEFAULT_PIPE;
  } catch {
    return DEFAULT_PIPE;
  }
}

export function goodbit(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<GoodBitReply> {
  const payload = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve) => {
    const req = request(
      {
        socketPath: pipe(),
        path,
        method: options.method ?? 'GET',
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
        timeout: options.timeoutMs ?? TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>;
          } catch {
            /* no body */
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    // Not running, switched off, or on another profile. All read the same
    // from a key, and the log says which.
    const fail = (why: string): void => {
      streamDeck.logger.warn(`GoodBit did not answer: ${why}`);
      resolve({ status: 0, body: { error: 'GoodBit is not listening' } });
    };
    req.on('timeout', () => {
      req.destroy();
      fail('timeout');
    });
    req.on('error', (error) => fail(error.name));
    if (payload) req.write(payload);
    req.end();
  });
}

/** Whether a reply means the thing worked. 202 counts: publishing runs on. */
export const succeeded = (reply: GoodBitReply): boolean =>
  reply.status >= 200 && reply.status < 300;
