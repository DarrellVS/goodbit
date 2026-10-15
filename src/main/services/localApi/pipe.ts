/**
 * OWNER: transport.
 *
 * The pipe: a random name per launch, and the one place a listener is bound.
 *
 * Never `readableAll` or `writableAll` (they add Everyone). libuv creates a
 * pipe server with FILE_FLAG_FIRST_PIPE_INSTANCE, so `listen` fails with
 * EADDRINUSE rather than joining a pipe somebody else made.
 */
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { localApiPipeName } from '@shared/localApi';

/** A fresh `\\.\pipe\goodbit-api-<uuid>`, new at every start. */
export function newLocalApiPipeName(): string {
  return localApiPipeName(randomUUID());
}

/** Bind `server` to `name` exclusively. Rejects if the name is taken; never joins an existing pipe. */
export function listenOnPipe(server: Server, name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen({ path: name }, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

/** Close the listener and every open connection, resolving when the pipe is released. */
export function closePipe(server: Server): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!server.listening) {
      server.closeAllConnections?.();
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}
