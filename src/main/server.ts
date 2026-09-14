import express from 'express';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { SESSION_HEADER, sessionSecret } from './ipc/apiBridge.js';

/**
 * The API, on a socket with no address.
 *
 * Reached only by the IPC bridge in the same process, never by the renderer.
 * The Express router is kept rather than rewritten into forty IPC channels,
 * see ipc/apiBridge.ts for why the transport moved but the routes did not.
 *
 * Three things are gone already, because none of them mean anything here:
 *
 * - **Firebase auth.** Replaced by a per-launch secret that only main knows.
 * - **The Private Network Access header and the LAN endpoints.** Those existed
 *   so a page served over the internet could reach the server on the LAN.
 * - **The public endpoints** and the spoofable `::1` check that guarded them.
 *
 * There is no TCP port. It used to bind 127.0.0.1 on an OS-chosen port, which
 * nothing outside the machine could reach but every other program on it could,
 * so the per-launch secret was the only thing standing between this API and
 * anything else running as the same user. That is defence rather than absence.
 *
 * It listens on a named pipe on Windows and a Unix socket elsewhere, at a path
 * nobody else is told. The socket is not addressable from the network at all,
 * and the filesystem permissions are the operating system's rather than ours.
 * The secret header stays, because two locks are better than one.
 */
export interface LocalServer {
  /** Named pipe on Windows, Unix domain socket elsewhere. */
  socketPath: string;
  close: () => Promise<void>;
}

/** Somewhere only this launch knows about. */
function socketPathForThisLaunch(): string {
  const id = randomUUID();
  // Windows pipes live in their own namespace rather than on disk, so there is
  // nothing to clean up afterwards.
  if (process.platform === 'win32') return `\\\\.\\pipe\\goodbit-${id}`;
  return path.join(os.tmpdir(), `goodbit-${id}.sock`);
}

export function createApiApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '1gb' }));

  /**
   * Only this process may call in.
   *
   * The listener is on loopback, which keeps it off the network but not away
   * from other programs on the machine, and this API can delete clips. The
   * secret is generated at launch, held in main, and never reaches the
   * renderer, so a request without it did not come from the app.
   */
  app.use('/api', (req, res, next) => {
    if (req.get(SESSION_HEADER) !== sessionSecret()) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });

  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
}

export function startLocalServer(): Promise<LocalServer> {
  const app = createApiApp();

  const socketPath = socketPathForThisLaunch();

  return new Promise((resolve, reject) => {
    // A socket rather than a port, so there is nothing for another program on
    // this machine to connect to even if it knew the secret.
    const server: Server = app.listen(socketPath, () => {
      console.log(`[api] listening on ${socketPath}`);

      resolve({
        socketPath,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              // Windows pipes disappear with the process. A Unix socket is a
              // file, and a stale one stops the next launch from binding.
              if (process.platform !== 'win32') {
                rmSync(socketPath, { force: true });
              }
              done();
            });
          }),
      });
    });

    server.on('error', reject);
  });
}
