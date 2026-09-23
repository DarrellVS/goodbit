import { createHash } from 'node:crypto';

/**
 * Where the Stream Deck plugin reaches GoodBit: a named pipe, not a port.
 *
 * It was `127.0.0.1:43120` behind a bearer token, a Host check and an Origin
 * check, because a port on loopback is reachable by every program on the
 * machine and by any web page the user has open. A pipe is neither:
 *
 * - **A browser cannot open one.** There is no URL for it, so the three
 *   checks that stopped web pages have nothing left to stop.
 * - **Windows decides who can write to it.** A pipe created without a
 *   security descriptor gets the default one, which gives write access to the
 *   account that created it, administrators and SYSTEM, and read access only
 *   to everybody else. A request is a write, so another account on the same
 *   machine cannot send one.
 * - **So the token goes.** It only ever stopped web pages and other machines;
 *   anything running as the user could read it out of the plugin's settings.
 *   That is exactly who can still reach the pipe, so it bought nothing the
 *   operating system does not now give for free.
 *
 * The same shape as the app's own internal API, which moved off a port for
 * the same reason. That one keeps a secret on top because it deletes clips
 * wholesale and is reached by the app's own renderer; this is a handful of
 * keys, each of which re-checks its own rules (discard needs its own setting,
 * a long press and a clip with nothing on it).
 */
const BASE = 'goodbit-streamdeck';

/**
 * The pipe for this profile.
 *
 * The default profile gets the plain name, which is what an installed plugin
 * assumes when nothing has told it otherwise. A profile moved with
 * `GOODBIT_USER_DATA` (a test, or a dev build beside the installed app) gets
 * its own, so the two never answer for each other; `connection.json` tells the
 * plugin which.
 */
export function streamDeckPipeName(customDataDir: string | null | undefined): string {
  if (!customDataDir) return `\\\\.\\pipe\\${BASE}`;
  const suffix = createHash('sha256').update(customDataDir.toLowerCase()).digest('hex').slice(0, 10);
  return `\\\\.\\pipe\\${BASE}-${suffix}`;
}
