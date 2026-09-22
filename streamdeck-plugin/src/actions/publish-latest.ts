import { action, type KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';

/**
 * Publish the clip you just saved.
 *
 * GoodBit answers at once and uploads behind the answer, because an upload is
 * minutes of a home uplink and a key cannot wait that long. A tick here means
 * "started", not "done"; GoodBit's own publish card says when it is up.
 */
@action({ UUID: 'io.github.darrellvs.goodbit.publish-latest' })
export class PublishLatest extends SingletonAction {
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const reply = await goodbit('/v1/latest/publish', { method: 'POST' });
    if (succeeded(reply)) {
      await ev.action.showOk();
      return;
    }
    await ev.action.showAlert();
  }
}
