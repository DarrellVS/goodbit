/**
 * OWNER: transport.
 *
 * The HTTP server on the pipe: framing, the 4 KB body limit, JSON parsing,
 * `matchRoute`, the 503 until ready, and writing a `RouteReply`. It decides
 * nothing about what a route does.
 *
 * `GET /v1/events` is handed to `subscribe` with the raw response; every other
 * route goes through `handleRoute`. Dispatch is on the `matchRoute` result,
 * never a lookup the request can choose a function from.
 * Never throws: a server that will not start is a feature that is off.
 * Never writes before a request: the client always speaks first.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  errorReply,
  LOCAL_API_LIMITS,
  matchRoute,
  type RouteReply,
  type RouteRequest,
} from '@shared/localApi';
import { loadSettings } from '../../settings.js';
import { closePipe, listenOnPipe } from './pipe.js';
import { handleRoute } from './routes.js';
import { subscribe } from './stream.js';

let http: Server | null = null;
let ready = false;

class BodyError extends Error {
  constructor(readonly kind: 'too_large' | 'bad_json') {
    super(kind);
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') return {};
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > LOCAL_API_LIMITS.bodyBytes) throw new BodyError('too_large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    throw new BodyError('bad_json');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BodyError('bad_json');
  return parsed;
}

function send(res: ServerResponse, reply: RouteReply): void {
  if (res.headersSent || res.writableEnded) return;
  if ('bytes' in reply) {
    const headers: Record<string, string | number> = {
      'content-type': reply.contentType,
      'content-length': reply.bytes.length,
    };
    if (reply.cacheControl) headers['cache-control'] = reply.cacheControl;
    res.writeHead(reply.status, headers);
    res.end(Buffer.from(reply.bytes));
    return;
  }
  const text = JSON.stringify(reply.json);
  res.writeHead(reply.status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

function queryOf(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) query[key] = value;
  return query;
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://local');
  } catch {
    return send(res, errorReply('bad_request', 'Unreadable request path'));
  }

  const match = matchRoute(req.method ?? 'GET', url.pathname);
  if (!match) return send(res, errorReply('not_found', 'No such route'));
  // The Stream Deck group exists only while its own switch is on.
  if (match.route.group === 'streamdeck' && !loadSettings().streamDeckEnabled) {
    return send(res, errorReply('not_found', 'No such route'));
  }
  if (!ready) return send(res, errorReply('starting', 'GoodBit is still starting'));

  if (match.route.key === 'GET /v1/events') {
    const result = await subscribe(res);
    if (!result.ok) send(res, errorReply(result.error, 'The event stream is not available right now'));
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (error) {
    if (error instanceof BodyError && error.kind === 'too_large') {
      return send(res, errorReply('payload_too_large', 'The request body is too large'));
    }
    return send(res, errorReply('bad_request', 'The request body is not a JSON object'));
  }

  const header = req.headers['goodbit-session'];
  const request: RouteRequest = {
    route: match.route.key,
    params: match.params,
    query: queryOf(url),
    body,
    sessionId: typeof header === 'string' && header ? header : null,
    now: Date.now(),
  };
  send(res, await handleRoute(request));
}

/** Create the server, bind it to `pipe`, answer 503 `starting` until `markReady`. Resolves false if the name is taken. */
export async function startServer(pipe: string): Promise<boolean> {
  if (http) return true;
  ready = false;
  const server = createServer((req, res) => {
    serve(req, res).catch((error: unknown) => {
      console.error('[local-api]', error instanceof Error ? error.message : error);
      send(res, errorReply('internal', 'Something went wrong in GoodBit'));
    });
  });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    else socket.destroy();
  });
  try {
    await listenOnPipe(server, pipe);
  } catch (error) {
    console.error('[local-api] could not listen:', error instanceof Error ? error.message : error);
    await closePipe(server);
    return false;
  }
  http = server;
  return true;
}

/** Let requests through to `handleRoute`. Called once the snapshot can be built. */
export function markReady(): void {
  ready = true;
}

/** End every stream, then close the pipe. */
export async function stopServer(): Promise<void> {
  const closing = http;
  http = null;
  ready = false;
  if (closing) await closePipe(closing);
}

export function serverRunning(): boolean {
  return http !== null;
}

/** The live server, for tests and the bench. Null when stopped. */
export function currentServer(): Server | null {
  return http;
}
