import { ipcMain } from 'electron';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { startLocalServer, type LocalServer } from '../server.js';

/**
 * The API, reachable only from inside the app.
 *
 * The renderer makes roughly forty calls across six service files. Rewriting
 * each into its own channel would be forty chances to change a signature by
 * accident, so the Express router is kept and the transport changes instead:
 * the renderer talks IPC, and main relays to a loopback server in the same
 * process. Every route keeps working, unchanged.
 *
 * Faking a `ServerResponse` was tried first and does not work: `app.handle`
 * reassigns the response's prototype to Express's own, which inherits from
 * `http.ServerResponse`, so a hand-written `getHeader` is bypassed and Node's
 * real one runs against an object with no socket behind it. Relaying to a real
 * server keeps Express on the objects it expects.
 *
 * The listener is on 127.0.0.1 at a port the OS picks, which any other process
 * on the machine can still reach, so every request must carry a secret
 * generated fresh at launch. The renderer never sees it; only this module and
 * the server do.
 */

export interface ApiRequest {
  method: string;
  /** Path under /api, e.g. `/clips/12/trim`. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

/** Regenerated every launch; never written to disk, never sent to the renderer. */
const SESSION_SECRET = randomBytes(32).toString('hex');

export const SESSION_HEADER = 'x-goodbit-session';

export function sessionSecret(): string {
  return SESSION_SECRET;
}

let server: LocalServer | null = null;

export async function startApiBridge(): Promise<void> {
  server = await startLocalServer();
}

export async function stopApiBridge(): Promise<void> {
  await server?.close();
  server = null;
}

function relay(request: ApiRequest): Promise<ApiResponse> {
  return new Promise((resolve) => {
    if (!server) return resolve({ status: 503, body: { error: 'The API is not running' } });

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value === undefined || value === null) continue;
      search.set(key, String(value));
    }

    const qs = search.toString();
    const payload =
      request.body === undefined || request.body === null
        ? null
        : Buffer.from(JSON.stringify(request.body));

    const outbound = httpRequest(
      {
        host: '127.0.0.1',
        port: server.port,
        method: (request.method || 'GET').toUpperCase(),
        path: `/api${request.path}${qs ? `?${qs}` : ''}`,
        headers: {
          'content-type': 'application/json',
          [SESSION_HEADER]: SESSION_SECRET,
          ...(payload ? { 'content-length': String(payload.byteLength) } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let body: unknown = null;
          if (text) {
            try {
              body = JSON.parse(text);
            } catch {
              body = text;
            }
          }
          resolve({ status: response.statusCode ?? 500, body });
        });
      },
    );

    outbound.on('error', (error) =>
      resolve({ status: 500, body: { error: error.message } }),
    );

    if (payload) outbound.write(payload);
    outbound.end();
  });
}

export function registerApiBridge(): void {
  ipcMain.handle('api:request', (_event, request: ApiRequest) => relay(request));
}
