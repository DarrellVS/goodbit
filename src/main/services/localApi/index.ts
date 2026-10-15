/**
 * OWNER: transport.
 *
 * Lifecycle and the switch: boot, the settings, start, stop, quit. The one
 * file the rest of main imports.
 *
 * Never throws. Order at start: new pipe name, server, stream sources,
 * discovery file written last, so a client that finds the file can connect.
 * Order at stop: discovery file removed first.
 */
import { app } from 'electron';
import { LOCAL_API_APP_NAME, LOCAL_API_VERSION, type LocalApiDiscovery } from '@shared/localApi';
import { loadSettings, saveSettings, type Settings } from '../../settings.js';
import { writePluginConnection } from '../streamdeck/plugin.js';
import { streamDeckPipeName } from '../streamdeck/pipe.js';
import { removeDiscovery, writeDiscovery } from './discovery.js';
import { newLocalApiPipeName } from './pipe.js';
import { markReady, serverRunning, startServer, stopServer } from './server.js';
import { startStream, stopStream } from './stream.js';

let pipe: string | null = null;
let starting: Promise<boolean> | null = null;

/**
 * Write down what `localApiEnabled` is, the first time a boot sees it unset:
 * from `streamDeckEnabled`, so somebody who already let a program in is not
 * left with a switch that disagrees. Discard follows the Stream Deck's own.
 */
export function settleLocalApiSetting(): void {
  const settings = loadSettings();
  const patch: Partial<Settings> = {};
  if (settings.localApiEnabled === undefined) patch.localApiEnabled = settings.streamDeckEnabled === true;
  if (settings.localApiAllowDiscard === undefined) {
    patch.localApiAllowDiscard = settings.streamDeckAllowDiscard === true;
  }
  if (Object.keys(patch).length) saveSettings(patch);
}

/** Tell an installed Stream Deck plugin which pipe to use: the random one while running, else the alias. */
function pointPlugin(): void {
  if (!loadSettings().streamDeckEnabled) return;
  writePluginConnection({ pipe: pipe ?? streamDeckPipeName(process.env.GOODBIT_USER_DATA) });
}

function appVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0';
  }
}

/** Boot step: start if the setting is on. Isolated like every other boot step. */
export async function initLocalApi(): Promise<void> {
  try {
    settleLocalApiSetting();
    if (loadSettings().localApiEnabled) await startLocalApi();
  } catch (error) {
    console.error('[local-api] boot failed:', error instanceof Error ? error.message : error);
  }
}

async function doStart(): Promise<boolean> {
  const name = newLocalApiPipeName();
  try {
    if (!(await startServer(name))) return false;
    pipe = name;
    startStream();
    markReady();
    const discovery: LocalApiDiscovery = {
      api: LOCAL_API_VERSION,
      pipe: name,
      pid: process.pid,
      app: LOCAL_API_APP_NAME,
      version: appVersion(),
      startedAt: new Date().toISOString(),
    };
    if (!writeDiscovery(discovery)) {
      await stopLocalApi();
      return false;
    }
    pointPlugin();
    console.log(`[local-api] listening on ${name}`);
    return true;
  } catch (error) {
    console.error('[local-api] could not start:', error instanceof Error ? error.message : error);
    await stopLocalApi();
    return false;
  }
}

/** Start the server and write the discovery file. Resolves false when it could not start. */
export function startLocalApi(): Promise<boolean> {
  if (pipe && serverRunning()) return Promise.resolve(true);
  if (!starting) {
    starting = doStart().finally(() => {
      starting = null;
    });
  }
  return starting;
}

/** Remove the discovery file, end every stream, close the pipe. Safe to call when stopped. */
export async function stopLocalApi(): Promise<void> {
  removeDiscovery();
  pipe = null;
  try {
    stopStream();
  } catch {
    /* a stream that will not stop must not keep the pipe open */
  }
  try {
    await stopServer();
  } catch {
    /* closed as far as it can be */
  }
  pointPlugin();
}

/** Flip the setting and start or stop to match. Resolves to whether it is now running. */
export async function setLocalApiEnabled(enabled: boolean): Promise<boolean> {
  saveSettings({ localApiEnabled: enabled });
  if (enabled) return startLocalApi();
  await stopLocalApi();
  return false;
}

export function localApiRunning(): boolean {
  return pipe !== null && serverRunning();
}

/** This launch's pipe name, or null when stopped. For the Settings card. */
export function localApiPipe(): string | null {
  return pipe;
}
