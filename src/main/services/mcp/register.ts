/**
 * Putting GoodBit into the config of whatever can talk to it.
 *
 * The same idea as the publisher's setup link and the OBS setup: the app knows
 * the answer, so nobody should have to copy a token out of a settings screen
 * and paste it into a JSON file.
 *
 * Three clients, and they are more alike than they look. All three keep an
 * `mcpServers` object keyed by server name, and all three accept the same
 * entry for an HTTP server. They differ only in where that object lives and in
 * whether the file exists before GoodBit touches it.
 *
 * The rule is the same one the OBS module lives by: read what is there, change
 * exactly one key, back the file up first, and never write a client that is not
 * installed. Somebody's Claude config is not ours to create on a machine that
 * has no Claude.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupsDir } from '../../settings.js';
import { mcpToken, mcpUrl } from './server.js';

export const SERVER_NAME = 'goodbit';

export type ClientId = 'claude-code' | 'claude-desktop' | 'cursor';

interface ClientTarget {
  id: ClientId;
  label: string;
  /** Where the config lives, or null when this client is not on the machine. */
  configPath: () => string | null;
  /**
   * Is this client on the machine at all?
   *
   * The config file is the best evidence, since every one of these writes it on
   * first run. A second look at the install directory catches a client that is
   * installed but has never been opened.
   */
  installed: () => boolean;
  /** What to say when it is not there. */
  note?: string;
}

const home = (): string => os.homedir();

/**
 * Where Claude Desktop really keeps its config on this machine.
 *
 * An existing file wins, wherever it is. Otherwise the packaged container, if
 * this is the Store build. Otherwise the documented path, which is right for
 * the plain installer.
 */
function desktopConfigPath(): string | null {
  const roaming = process.env.APPDATA ?? path.join(home(), 'AppData', 'Roaming');
  const local = process.env.LOCALAPPDATA ?? path.join(home(), 'AppData', 'Local');

  const documented = path.join(roaming, 'Claude', 'claude_desktop_config.json');
  if (existsSync(documented)) return documented;

  try {
    const packages = path.join(local, 'Packages');
    const container = readdirSync(packages).find((name) => name.startsWith('Claude_'));
    if (container) {
      const packaged = path.join(
        packages,
        container,
        'LocalCache',
        'Roaming',
        'Claude',
        'claude_desktop_config.json',
      );
      if (existsSync(path.dirname(packaged))) return packaged;
    }
  } catch {
    // No packages folder, or nothing readable in it.
  }

  return existsSync(path.join(roaming, 'Claude')) ? documented : null;
}

export const CLIENTS: ClientTarget[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    configPath: () => path.join(process.env.CLAUDE_CONFIG_DIR || home(), '.claude.json'),
    installed() {
      const file = this.configPath();
      return (file !== null && existsSync(file)) || existsSync(path.join(home(), '.claude'));
    },
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    /*
     * Not where the documentation says, on a machine that installed it from
     * the Store.
     *
     * Claude Desktop ships as an MSIX package, and Windows redirects a
     * packaged app's `%APPDATA%` into its own container. So the config that
     * every guide calls `%APPDATA%\Claude\claude_desktop_config.json` is
     * really under `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming`,
     * and writing the documented path on this machine would produce a file the
     * app never reads.
     *
     * The unpackaged installer does use the documented path, so both are
     * checked, and a real file wins over a guess.
     */
    configPath: () => desktopConfigPath(),
    installed() {
      const file = desktopConfigPath();
      return file !== null && existsSync(path.dirname(file));
    },
    note: 'Claude Desktop reads this at startup, and only recent versions load a server they do not launch themselves.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configPath: () => path.join(home(), '.cursor', 'mcp.json'),
    installed() {
      return existsSync(path.join(home(), '.cursor'));
    },
  },
];

/** The entry every one of them takes. */
function entry(): Record<string, unknown> {
  return {
    type: 'http',
    url: mcpUrl(),
    headers: { Authorization: `Bearer ${mcpToken()}` },
  };
}

export interface ClientState {
  id: ClientId;
  label: string;
  installed: boolean;
  registered: boolean;
  configPath: string | null;
  note?: string;
}

function readConfig(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isRegistered(file: string): boolean {
  const wanted = entry();
  const servers = (readConfig(file).mcpServers ?? {}) as Record<
    string,
    { url?: string; headers?: Record<string, string> }
  >;
  const current = servers[SERVER_NAME];

  return (
    current?.url === wanted.url &&
    current?.headers?.Authorization === (wanted.headers as Record<string, string>).Authorization
  );
}

/** What is on this machine, and which of them already know about GoodBit. */
export function clientStates(): ClientState[] {
  return CLIENTS.map((client) => {
    const configPath = client.configPath();
    return {
      id: client.id,
      label: client.label,
      installed: client.installed(),
      registered: configPath !== null && existsSync(configPath) && isRegistered(configPath),
      configPath,
      note: client.note,
    };
  });
}

/** The line to paste, for anyone who would rather do it themselves. */
export function manualCommand(): string {
  return `claude mcp add --transport http ${SERVER_NAME} ${mcpUrl()} --header "Authorization: Bearer ${mcpToken()}"`;
}

export interface RegisterResult {
  id: ClientId;
  label: string;
  ok: boolean;
  configPath: string | null;
  error?: string;
}

function write(client: ClientTarget, wanted: boolean): RegisterResult {
  const configPath = client.configPath();
  const base = { id: client.id, label: client.label, configPath };

  if (configPath === null) {
    return { ...base, ok: false, error: `${client.label} is not installed` };
  }

  try {
    // Never create a config for a client that is not installed: an empty
    // `claude_desktop_config.json` on a machine with no Claude Desktop is
    // litter, and it makes the next install behave oddly.
    if (!existsSync(configPath)) {
      if (!wanted) return { ...base, ok: true };
      if (!client.installed()) {
        return { ...base, ok: false, error: `${client.label} is not installed` };
      }
      mkdirSync(path.dirname(configPath), { recursive: true });
    } else {
      mkdirSync(backupsDir(), { recursive: true });
      copyFileSync(
        configPath,
        path.join(backupsDir(), `${path.basename(configPath)}.${Date.now()}.bak`),
      );
    }

    const config = readConfig(configPath);
    const servers = (config.mcpServers ?? {}) as Record<string, unknown>;

    if (wanted) servers[SERVER_NAME] = entry();
    else delete servers[SERVER_NAME];

    config.mcpServers = servers;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    return { ...base, ok: true };
  } catch (error) {
    return { ...base, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Add or remove the entry, in every client asked for.
 *
 * No `ids` means every client that is actually on the machine, which is what
 * the one press in Settings does.
 */
export function setRegistered(wanted: boolean, ids?: ClientId[]): RegisterResult[] {
  const chosen = CLIENTS.filter((client) =>
    ids ? ids.includes(client.id) : client.installed(),
  );
  return chosen.map((client) => write(client, wanted));
}
