import path from 'node:path';
import { app } from 'electron';

/**
 * `goodbit://` links from outside the app.
 *
 * One of these exists: the setup guide on the website ends with a button that
 * hands over the publisher's address and token, so nobody has to retype a
 * forty-character secret into a settings screen.
 *
 * **A link never changes a setting.** It fills a form in and asks. Anything
 * that can open a browser can open one of these, and a link that silently
 * repointed the publisher would mean every clip you published from then on
 * went to whoever sent it. The app comes to the front and shows what it is
 * being asked to do, and a person clicks. That is the whole security model,
 * and it is why parsing here is strict and applying here is impossible.
 */

export interface PublisherInvite {
  kind: 'publisher';
  url: string;
  token: string;
}

/**
 * The OBS setup, arriving from the guide on the website.
 *
 * Carries choices, never secrets and never paths: the website has no business
 * naming a folder on someone's disk, and the app already knows where its own
 * library is. Like the publisher invite, this opens the dialog with the boxes
 * ticked and writes nothing on its own.
 */
export interface ObsSetupInvite {
  kind: 'obs-setup';
  /** Which steps the reader chose on the website. */
  steps: ObsSetupStep[];
  bufferSeconds: number | null;
  hotkey: string | null;
}

export const OBS_SETUP_STEPS = ['profile', 'buffer', 'hotkey', 'scene', 'desktop'] as const;
export type ObsSetupStep = (typeof OBS_SETUP_STEPS)[number];

export type DeepLink = PublisherInvite | ObsSetupInvite;

/** Long enough for any sane secret, short enough not to be a payload. */
const MAX_TOKEN = 512;

/**
 * What the app answers to.
 *
 * Skipped when a test profile is in play: registering a protocol handler is a
 * machine-wide association, and a test run must not take it from the installed
 * copy. The same reasoning as the login item.
 */
export function registerProtocolClient(): void {
  if (process.env.GOODBIT_USER_DATA) return;

  if (process.defaultApp && process.argv.length >= 2) {
    // Running as `electron .`: the association has to point at the runner and
    // the project, or Windows launches Electron with nothing to run.
    app.setAsDefaultProtocolClient('goodbit', process.execPath, [path.resolve(process.argv[1])]);
    return;
  }
  app.setAsDefaultProtocolClient('goodbit');
}

/** The `goodbit://` argument out of a command line, if there is one. */
export function linkFromArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith('goodbit://')) ?? null;
}

/**
 * Read a link, or refuse it.
 *
 * Returns null rather than throwing for anything unexpected, because the input
 * is whatever a web page felt like sending and a malformed one is not an
 * error worth reporting to the person who received it.
 */
export function parseDeepLink(raw: string): DeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'goodbit:') return null;

  const route = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '');

  // `goodbit://setup/obs?steps=profile,buffer,hotkey&buffer=30&hotkey=F8`
  if (route === 'setup/obs') return parseObsSetup(parsed);

  // `goodbit://configure/publisher?url=…&token=…`
  if (route !== 'configure/publisher') return null;

  const url = (parsed.searchParams.get('url') ?? '').trim();
  const token = (parsed.searchParams.get('token') ?? '').trim();
  if (!url) return null;

  // An address the app will actually post a file to, so it has to be one it
  // could have been given by hand: a web address, nothing exotic.
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    return null;
  }
  if (address.protocol !== 'http:' && address.protocol !== 'https:') return null;

  if (token.length > MAX_TOKEN) return null;
  // Control characters in a header value are a request-splitting trick, and no
  // real token has them.
  if (/[\x00-\x1f\x7f]/.test(token)) return null;

  return {
    kind: 'publisher',
    url: address.toString().replace(/\/+$/, ''),
    token,
  };
}

/**
 * Read an OBS setup link.
 *
 * Every field is optional and every field is bounded. A link that names a step
 * this version does not have is not an error, it is a link from a newer page:
 * the unknown step is dropped and the rest still works.
 */
function parseObsSetup(parsed: URL): ObsSetupInvite | null {
  const rawSteps = (parsed.searchParams.get('steps') ?? '')
    .split(',')
    .map((step) => step.trim().toLowerCase())
    .filter((step): step is ObsSetupStep =>
      (OBS_SETUP_STEPS as readonly string[]).includes(step),
    );

  const bufferRaw = Number(parsed.searchParams.get('buffer'));
  // The same range OBS's own field accepts. A link asking for an hour of
  // buffered video would be asking for a machine with no memory left.
  const bufferSeconds =
    Number.isFinite(bufferRaw) && bufferRaw >= 5 && bufferRaw <= 300 ? Math.round(bufferRaw) : null;

  const keyRaw = (parsed.searchParams.get('hotkey') ?? '').trim().toUpperCase();
  const hotkey = /^F([1-9]|1[0-2])$/.test(keyRaw) ? `OBS_KEY_${keyRaw}` : null;

  return {
    kind: 'obs-setup',
    steps: [...new Set(rawSteps)],
    bufferSeconds,
    hotkey,
  };
}
