import { action, type KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';

/** How often to ask whether the upload has landed, and for how long. */
const POLL_MS = 2000;
const GIVE_UP_MS = 10 * 60_000;

/**
 * Publish the clip you just saved, and put its link on the clipboard.
 *
 * GoodBit answers at once and uploads behind the answer, because an upload is
 * minutes of a home uplink and a key cannot wait that long. So the key says
 * "Uploading" and asks every two seconds whether it has landed; GoodBit copies
 * the link the moment it has, and the key says so. A clip already published
 * has its link copied straight away.
 */
@action({ UUID: 'io.github.darrellvs.goodbit.publish-latest' })
export class PublishLatest extends SingletonAction {
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const key = ev.action;
    const reply = await goodbit('/v1/latest/publish', { method: 'POST' });

    if (!succeeded(reply)) {
      await key.setTitle(reply.status === 409 && reply.body.saving ? 'Saving\nfirst' : '');
      await key.showAlert();
      setTimeout(() => void key.setTitle(''), 3000);
      return;
    }

    if (reply.body.already) {
      await done(key, Boolean(reply.body.url));
      return;
    }

    await key.setTitle('Uploading');
    const id = reply.body.id;
    const deadline = Date.now() + GIVE_UP_MS;
    const tick = async (): Promise<void> => {
      const status = await goodbit('/v1/publish/status', { method: 'POST', body: { id } });
      if (succeeded(status) && status.body.published) {
        await done(key, Boolean(status.body.url));
        return;
      }
      if (Date.now() > deadline) {
        await key.setTitle('');
        await key.showAlert();
        return;
      }
      setTimeout(() => void tick(), POLL_MS);
    };
    setTimeout(() => void tick(), POLL_MS);
  }
}

async function done(
  key: { setTitle(title?: string): Promise<void>; showOk(): Promise<void> },
  copied: boolean,
): Promise<void> {
  await key.setTitle(copied ? 'Link\ncopied' : 'Published');
  await key.showOk();
  setTimeout(() => void key.setTitle(''), 3000);
}
