import express from 'express';
import type { Server } from 'node:http';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';

/**
 * The API, bound to loopback only.
 *
 * A migration scaffold, not the destination. The renderer still speaks HTTP to
 * roughly sixty routes; rewriting all of them at once would mean a long stretch
 * where nothing works, so the same Express app runs inside the main process
 * until each `services/*.ts` file has been moved over to IPC. It is deleted
 * when the last one has.
 *
 * Three things are gone already, because none of them mean anything here:
 *
 * - **Firebase auth.** There is nothing to authenticate: the listener is on
 *   127.0.0.1 and the only client is this app's own window.
 * - **The Private Network Access header and the LAN endpoints.** Those existed
 *   so a page served over the internet could reach the server on the LAN.
 * - **The public endpoints** (`today/count`, `latest`, `rescan`) and the
 *   spoofable `::1` check that guarded them.
 *
 * Binding to 127.0.0.1 on port 0 is deliberate: the OS picks a free port, so
 * two installs cannot collide, and nothing outside the machine can reach it
 * even briefly.
 */
export interface LocalServer {
  port: number;
  close: () => Promise<void>;
}

export function createApiApp(): express.Express {
  const app = express();

  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
