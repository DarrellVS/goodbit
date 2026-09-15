/**
 * An MCP server the app hosts, so Claude Code can work on the library.
 *
 * Off by default. It is a door into a database that holds the only copy of
 * everybody's tags and notes, and a door nobody opened should not exist.
 *
 * **Why HTTP and not stdio.** A stdio server is spawned by the client, which
 * would mean a second process that does not own the database, the ffmpeg jobs
 * or the watcher. GoodBit is already running and already owns all three, so
 * the client has to come to it, and that means listening.
 *
 * **Which is a step back from the named pipe, and is taken knowingly.** The
 * internal API moved off a TCP port onto a named pipe because every other
 * program on the machine could reach a port and that API deletes clips. This
 * is a port again, so it carries the protections the pipe made unnecessary:
 *
 * - **127.0.0.1 only.** Never `0.0.0.0`, so nothing off this machine can reach
 *   it at all.
 * - **Origin validation**, which the MCP specification makes a MUST rather than
 *   a suggestion. Without it a web page you merely visit can drive this, which
 *   is what DNS rebinding is for. The SDK enforces it given the allow lists.
 * - **A bearer token**, generated once and kept in settings, checked before the
 *   request reaches the protocol at all.
 * - **No delete tool**, so the worst a leak can do is read metadata and trim
 *   something, not empty a library.
 *
 * Be clear about what the token is not: it lives in the reader's own Claude
 * config, so anything already running as this user can read it. It defends
 * against web pages and against other machines, not against something that is
 * already inside. On a single user desktop that is the honest trade.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { app } from 'electron';
import { loadSettings, saveSettings } from '../../settings.js';
import { tools } from './tools.js';

export const MCP_PATH = '/mcp';
const DEFAULT_PORT = 43110;

let http: Server | null = null;
let listeningOn: number | null = null;

/** The token, made once and kept, so a saved Claude config keeps working. */
export function mcpToken(): string {
  const settings = loadSettings();
  if (settings.mcpToken) return settings.mcpToken;

  const token = randomBytes(24).toString('base64url');
  saveSettings({ mcpToken: token });
  return token;
}

export function mcpUrl(): string {
  const port = listeningOn ?? loadSettings().mcpPort ?? DEFAULT_PORT;
  return `http://127.0.0.1:${port}${MCP_PATH}`;
}

export function mcpRunning(): boolean {
  return http !== null;
}

function build(): McpServer {
  const server = new McpServer(
    { name: 'goodbit', version: app.getVersion() },
    {
      instructions:
        'GoodBit is a local library of game clips. Clips are files on disk in a folder per game; ' +
        'the tags, notes, stars and names live in GoodBit and are the only copy. Search first, ' +
        'then act on the ids you get back. Never assume a timestamp: ask suggest_highlights. ' +
        'trim_clip rewrites the file and cannot be undone, so confirm with the person first.',
    },
  );

  for (const tool of tools()) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      tool.run as never,
    );
  }

  return server;
}

/**
 * A server and a transport per request, which is what stateless means here.
 *
 * Holding one pair open and feeding every request through it answers the first
 * one and then returns 500 for ever: a stateless transport carries no session,
 * so it cannot tell one exchange from the next and refuses to be initialised
 * twice. Building both per request is the shape the SDK expects, and it costs
 * nothing: registering the tools is a handful of object literals, and the
 * work they do lives in the Actions, not here.
 */
async function handle(req: IncomingMessage, res: ServerResponse, port: number): Promise<void> {
  const server = build();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection: true,
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
    // Claude Code sends no browser Origin; a browser always does. Allowing
    // only these means a web page cannot reach this even knowing the port.
    allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

/**
 * Listen, if the user has asked for it.
 *
 * Never throws: an MCP server that will not start is a feature that is off,
 * not a reason for the library not to open.
 */
export async function startMcp(): Promise<void> {
  if (http) return;

  const settings = loadSettings();
  if (!settings.mcpEnabled) return;

  const token = mcpToken();
  const port = settings.mcpPort ?? DEFAULT_PORT;

  try {
    http = createServer((req, res) => {
      if (!req.url?.startsWith(MCP_PATH)) {
        res.writeHead(404).end();
        return;
      }

      // Before the protocol, not inside it. An unauthenticated request should
      // not reach a parser, let alone a tool.
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'GoodBit needs the token from Settings, Connections.' }));
        return;
      }

      void handle(req, res, port).catch((error: unknown) => {
        console.error('[mcp]', error instanceof Error ? error.message : error);
        if (!res.headersSent) res.writeHead(500).end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      http?.once('error', reject);
      // 127.0.0.1, never 0.0.0.0: nothing off this machine, ever.
      http?.listen(port, '127.0.0.1', resolve);
    });

    listeningOn = port;
    if (settings.mcpPort !== port) saveSettings({ mcpPort: port });
    console.log(`[mcp] listening on ${mcpUrl()}`);
  } catch (error) {
    console.error('[mcp] could not start:', error instanceof Error ? error.message : error);
    await stopMcp();
  }
}

export async function stopMcp(): Promise<void> {
  const closing = http;
  http = null;
  listeningOn = null;

  await new Promise<void>((resolve) => (closing ? closing.close(() => resolve()) : resolve()));
}

/** Turn it on or off without a restart, which is what a settings toggle has to do. */
export async function setMcpEnabled(enabled: boolean): Promise<void> {
  saveSettings({ mcpEnabled: enabled });
  if (enabled) await startMcp();
  else await stopMcp();
}
