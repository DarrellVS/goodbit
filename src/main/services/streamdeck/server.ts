/**
 * A small HTTP server the Stream Deck plugin talks to.
 *
 * Off by default, and when it is on, it is the same shape as the MCP server
 * because that is the precedent for opening a port in this app honestly:
 *
 * - **127.0.0.1 only**, never `0.0.0.0`. Nothing off this machine can reach it.
 * - **Host and Origin checked by hand** (`auth.ts`), which the MCP server gets
 *   from its SDK and a plain HTTP server does not. Without them a web page the
 *   user merely has open can post to this port.
 * - **A bearer token**, generated once and kept in settings, checked before a
 *   request reaches a handler.
 * - **Never throws**: a server that will not start is a feature that is off,
 *   not a reason for the library not to open.
 *
 * The routes are versioned (`/v1/...`) because the plugin ships separately and
 * will be a version behind the app sooner or later.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { loadSettings, saveSettings } from '../../settings.js';
import { checkRequest } from './auth.js';
import {
  discardLatest,
  health,
  publishLatest,
  stats,
  tagLatest,
  type KeyResult,
} from './actions.js';

const DEFAULT_PORT = 43120;
/** A key sends a few bytes. Anything bigger is not the plugin. */
const BODY_LIMIT = 4 * 1024;

let http: Server | null = null;
let listeningOn: number | null = null;

export function streamDeckToken(): string {
  const settings = loadSettings();
  if (settings.streamDeckToken) return settings.streamDeckToken;

  const token = randomBytes(24).toString('base64url');
  saveSettings({ streamDeckToken: token });
  return token;
}

export function streamDeckUrl(): string {
  const port = listeningOn ?? loadSettings().streamDeckPort ?? DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

export function streamDeckRunning(): boolean {
  return http !== null;
}

type Handler = (body: Record<string, unknown>) => Promise<KeyResult>;

const ROUTES: Record<string, Handler> = {
  'GET /v1/health': () => health(),
  'GET /v1/stats': () => stats(),
  'POST /v1/latest/tag': (body) => tagLatest(body),
  'POST /v1/latest/publish': () => publishLatest(),
  'POST /v1/latest/discard': (body) => discardLatest(body),
};

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') return {};

  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > BODY_LIMIT) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export async function startStreamDeck(): Promise<void> {
  if (http) return;

  const settings = loadSettings();
  if (!settings.streamDeckEnabled) return;

  const token = streamDeckToken();
  const port = settings.streamDeckPort ?? DEFAULT_PORT;

  try {
    http = createServer((req, res) => {
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      // Before anything else, including routing, so an unauthenticated caller
      // learns nothing about which paths exist.
      const verdict = checkRequest(
        {
          method: req.method ?? '',
          host: req.headers.host,
          origin: req.headers.origin,
          authorization: req.headers.authorization,
        },
        { token, port },
      );
      if (!verdict.ok) return send(verdict.status, { error: verdict.error });

      const path = (req.url ?? '').split('?')[0];
      const route = ROUTES[`${req.method} ${path}`];
      if (!route) return send(404, { error: 'No such key' });

      void readBody(req)
        .then((body) => route(body))
        .then((result) => send(result.status, result.body))
        .catch((error: unknown) => {
          console.error('[streamdeck]', error instanceof Error ? error.message : error);
          if (!res.headersSent) send(500, { error: 'Something went wrong in GoodBit' });
        });
    });

    await new Promise<void>((resolve, reject) => {
      http?.once('error', reject);
      // 127.0.0.1, never 0.0.0.0: nothing off this machine, ever.
      http?.listen(port, '127.0.0.1', resolve);
    });

    listeningOn = port;
    if (settings.streamDeckPort !== port) saveSettings({ streamDeckPort: port });
    console.log(`[streamdeck] listening on ${streamDeckUrl()}`);
  } catch (error) {
    console.error('[streamdeck] could not start:', error instanceof Error ? error.message : error);
    await stopStreamDeck();
  }
}

export async function stopStreamDeck(): Promise<void> {
  const closing = http;
  http = null;
  listeningOn = null;
  await new Promise<void>((resolve) => (closing ? closing.close(() => resolve()) : resolve()));
}

/** Turn it on or off without a restart, which is what a settings toggle has to do. */
export async function setStreamDeckEnabled(enabled: boolean): Promise<void> {
  saveSettings({ streamDeckEnabled: enabled });
  if (enabled) await startStreamDeck();
  else await stopStreamDeck();
}
