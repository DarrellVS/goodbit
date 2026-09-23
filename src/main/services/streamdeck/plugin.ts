import { app, shell } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * GoodBit's own Stream Deck plugin: where it is, whether it is installed, and
 * how it learns where GoodBit is listening.
 *
 * **One press installs it and connects it.** The plugin ships inside GoodBit
 * (`resources/streamdeck/`, from `electron-builder.yml`), and installing it is
 * handing the `.streamDeckPlugin` to Windows, which gives it to the Stream
 * Deck app, which asks the user. There is no other install API.
 *
 * Then GoodBit writes `connection.json`, which pipe to use, into the folder
 * the Stream Deck app unpacked the plugin into. The plugin reads it on every
 * press. There is no secret in it: the pipe is the whole connection, and
 * Windows decides who may write to it (see `pipe.ts`). Without the file the
 * plugin uses the default profile's pipe, which is the installed app's.
 */

export const PLUGIN_UUID = 'io.github.darrellvs.goodbit';
const PACKAGE = `${PLUGIN_UUID}.streamDeckPlugin`;

/** Where the Stream Deck app unpacks a plugin, on Windows. */
export function installedPluginDir(): string {
  return path.join(app.getPath('appData'), 'Elgato', 'StreamDeck', 'Plugins', `${PLUGIN_UUID}.sdPlugin`);
}

export function pluginInstalled(): boolean {
  return existsSync(path.join(installedPluginDir(), 'manifest.json'));
}

/**
 * The packaged plugin, or null.
 *
 * Packaged, it is a resource. From a checkout it is whatever
 * `streamdeck-plugin/` last packed into its `dist/`, found from the app path
 * (`out/main` when Electron is started on the bundle) or the working folder.
 */
export function pluginPackage(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'streamdeck', PACKAGE),
    path.join(app.getAppPath(), '..', '..', 'streamdeck-plugin', 'dist', PACKAGE),
    path.join(process.cwd(), 'streamdeck-plugin', 'dist', PACKAGE),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Write the address and token where the installed plugin reads them. False when it is not installed. */
export function writePluginConnection(connection: { pipe: string }): boolean {
  const dir = installedPluginDir();
  if (!existsSync(dir)) return false;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'connection.json'), JSON.stringify(connection, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.warn('[streamdeck] could not write the plugin connection:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Hand the plugin to the Stream Deck app, then connect it once it lands.
 *
 * The app asks before installing, so the folder appears whenever the user
 * says yes. Watched for two minutes; after that the next start of the Stream
 * Deck server writes the file anyway.
 */
export async function installPlugin(
  connection: () => { pipe: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = pluginPackage();
  if (!file) return { ok: false, error: 'This build of GoodBit does not carry the Stream Deck plugin.' };

  const failure = await shell.openPath(file);
  if (failure) {
    return {
      ok: false,
      error: `Windows could not open the plugin (${failure}). Is the Stream Deck app installed?`,
    };
  }

  const deadline = Date.now() + 120_000;
  const timer = setInterval(() => {
    if (writePluginConnection(connection()) || Date.now() > deadline) clearInterval(timer);
  }, 1000);
  return { ok: true };
}
