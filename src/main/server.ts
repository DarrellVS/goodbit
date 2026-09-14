import express from 'express';
import type { Server } from 'node:http';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { SESSION_HEADER, sessionSecret } from './ipc/apiBridge.js';

/**
 * The API, bound to loopback only.
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
 * Binding to 127.0.0.1 on port 0 is deliberate: the OS picks a free port, so
 * two installs cannot collide, and nothing outside the machine can reach it.
 */
export interface LocalServer {
  port: number;
  close: () => Promise<void>;
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

  return new Promise((resolve, reject) => {
    // Port 0: let the OS choose. Loopback: unreachable from the network.
    const server: Server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        return reject(new Error('Could not determine the local API port'));
      }

      console.log(`[api] listening on 127.0.0.1:${address.port}`);

      resolve({
        port: address.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });

    server.on('error', reject);
  });
}
