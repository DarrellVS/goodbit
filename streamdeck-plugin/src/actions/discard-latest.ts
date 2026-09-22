import { action, type KeyDownEvent, type KeyUpEvent, SingletonAction } from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';

/**
 * How long the key has to be held.
 *
 * Long enough that a stray press mid-game does nothing, short enough that
 * somebody who means it is not left standing on the key.
 */
const HOLD_MS = 1200;

/**
 * Throw away the clip you just saved, **only on a long press**.
 *
 * A key pressed mid-game by somebody not looking at a screen has no room for a
 * confirmation, so the hold is the confirmation. A tap does nothing but say
 * "hold". Even then GoodBit decides, not this plugin: it is off in GoodBit's
 * Settings until switched on, and it keeps any clip carrying something only
 * GoodBit holds (a name, tags, notes, marks, a star, a public link), because
 * the file goes to the Recycle Bin and comes back while the row does not.
 *
 * Timed from key down to key up in this process, because that is the one
 * place both ends of the press are seen.
 */
@action({ UUID: 'io.github.darrellvs.goodbit.discard-latest' })
export class DiscardLatest extends SingletonAction {
  private readonly pressedAt = new Map<string, number>();

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    this.pressedAt.set(ev.action.id, Date.now());
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const started = this.pressedAt.get(ev.action.id);
    this.pressedAt.delete(ev.action.id);

    if (!started || Date.now() - started < HOLD_MS) {
      await ev.action.setTitle('Hold');
      setTimeout(() => void ev.action.setTitle(''), 1500);
      return;
    }

    // `confirm` is the long press, said to the server in words. GoodBit refuses
    // a discard without it, so a plugin that forgot the hold still could not
    // delete anything.
    const reply = await goodbit('/v1/latest/discard', { method: 'POST', body: { confirm: true } });
    if (succeeded(reply)) {
      await ev.action.showOk();
      return;
    }

    const reason = typeof reply.body.reason === 'string' ? reply.body.reason : null;
    await ev.action.setTitle(reason ? 'Kept' : 'No');
    await ev.action.showAlert();
    setTimeout(() => void ev.action.setTitle(''), 2000);
  }
}
