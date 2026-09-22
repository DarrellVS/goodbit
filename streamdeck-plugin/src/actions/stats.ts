import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';

/** Every half minute. A local query against a local database, so cheap. */
const POLL_MS = 30_000;

/**
 * Today's clip count on the key, and the library total under it.
 *
 * Polled while the key is on screen and not otherwise. That is fine here in a
 * way polling a remote publisher would not be: this asks the app on this
 * machine, which answers from its own database. Pressing the key refreshes it
 * at once.
 */
@action({ UUID: 'io.github.darrellvs.goodbit.stats' })
export class Stats extends SingletonAction {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    // The manifest only offers this on a keypad, but the event covers dials
    // too, and a title belongs to a key.
    const key = ev.action;
    if (!key.isKey()) return;

    await show(key);
    this.timers.set(key.id, setInterval(() => void show(key), POLL_MS));
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    const timer = this.timers.get(ev.action.id);
    if (timer) clearInterval(timer);
    this.timers.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    if (!(await show(ev.action))) await ev.action.showAlert();
  }
}

/** Put the counts on a key. Returns whether GoodBit answered. */
/**
 * Structural rather than `KeyAction<...>`: the settings type it is generic over
 * is not exported by the SDK, and all this needs from a key is its title.
 */
async function show(key: { setTitle(title?: string): Promise<void> }): Promise<boolean> {
  const reply = await goodbit('/v1/stats');
  if (!succeeded(reply)) {
    await key.setTitle('GoodBit\noff');
    return false;
  }
  const today = Number(reply.body.today ?? 0);
  const clips = Number(reply.body.clips ?? 0);
  await key.setTitle(`${today} today\n${clips} total`);
  return true;
}
