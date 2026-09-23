/**
 * A small HTTP server the Stream Deck plugin talks to, on a named pipe.
 *
 * Off by default. HTTP because it is the simplest request and reply there is
 * and Node serves it on a pipe as happily as on a port; a pipe rather than a
 * port because a browser cannot reach one and Windows only lets this account
 * write to it. See `pipe.ts` for why that retired the token and the Host and
 * Origin checks the port needed.
 *
 * **Never throws**: a server that will not start is a feature that is off,
 * not a reason for the library not to open. That includes the pipe name
 * already being taken, which is what a second GoodBit on the same profile, or
 * a program squatting the name, looks like.
 *
 * The routes are versioned (`/v1/...`) because the plugin ships separately and
 * will be a version behind the app sooner or later.
 */
import { writePluginConnection } from './plugin.js';
import { prepareReplayKey } from '../obs/saveReplay.js';
import { streamDeckPipeName } from './pipe.js';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { loadSettings, saveSettings } from '../../settings.js';
import {
  discardLatest,
  health,
  latestPreview,
  publishLatest,
  publishStatus,
  saveReplayFromKey,
  stats,
  tagLatest,
  type KeyResult,
} from './actions.js';

/** A key sends a few bytes. Anything bigger is not the plugin. */
const BODY_LIMIT = 4 * 1024;

let http: Server | null = null;

/** The pipe for this profile. See `pipe.ts`. */
export function streamDeckPipe(): string {
  return streamDeckPipeName(process.env.GOODBIT_USER_DATA);
}

export function streamDeckRunning(): boolean {
  return http !== null;
}

type Handler = (body: Record<string, unknown>) => Promise<KeyResult>;

/*
 * A Map, not an object literal. The key is built from the request, and an
 * object lookup would also find everything objects inherit, so `GET
 * constructor`-shaped requests reach a function nobody listed. A Map holds
 * exactly the entries put in it.
 */
const ROUTES = new Map<string, Handler>([
  ['GET /v1/health', () => health()],
  ['GET /v1/stats', () => stats()],
  ['POST /v1/latest/tag', (body) => tagLatest(body)],
  ['POST /v1/latest/publish', () => publishLatest()],
  ['POST /v1/latest/discard', (body) => discardLatest(body)],
  ['POST /v1/replay/save', () => saveReplayFromKey()],
  ['GET /v1/latest/preview', () => latestPreview()],
  ['POST /v1/publish/status', (body) => publishStatus(body)],
]);

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

  const pipe = streamDeckPipe();

  try {
    http = createServer((req, res) => {
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      const path = (req.url ?? '').split('?')[0];
      const route = ROUTES.get(`${req.method} ${path}`);
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
      http?.listen(pipe, resolve);
    });

    console.log(`[streamdeck] listening on ${pipe}`);
    // An installed plugin learns which pipe from GoodBit itself, and the key
    // helper is compiled now rather than on the first press.
    writePluginConnection({ pipe });
    prepareReplayKey();
  } catch (error) {
    console.error('[streamdeck] could not start:', error instanceof Error ? error.message : error);
    await stopStreamDeck();
  }
}

export async function stopStreamDeck(): Promise<void> {
  const closing = http;
  http = null;
  await new Promise<void>((resolve) => (closing ? closing.close(() => resolve()) : resolve()));
}

/** Turn it on or off without a restart, which is what a settings toggle has to do. */
export async function setStreamDeckEnabled(enabled: boolean): Promise<void> {
  saveSettings({ streamDeckEnabled: enabled });
  if (enabled) await startStreamDeck();
  else await stopStreamDeck();
}
