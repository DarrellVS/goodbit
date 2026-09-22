import { action, type KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';

interface TagSettings {
  [key: string]: string | undefined;
  tag?: string;
}

/**
 * Tag the clip you just saved with the tag this key was set up with.
 *
 * GoodBit refuses while the newest clip is still being filed, because in those
 * few seconds "the latest clip" in the library is the *previous* one and the
 * tag would land on the wrong recording. The key shows the alert triangle and
 * the title says why, so a second press a moment later does the right thing.
 */
@action({ UUID: 'io.github.darrellvs.goodbit.tag-latest' })
export class TagLatest extends SingletonAction<TagSettings> {
  override async onKeyDown(ev: KeyDownEvent<TagSettings>): Promise<void> {
    const tag = ev.payload.settings.tag?.trim();
    if (!tag) {
      await ev.action.setTitle('Set a tag');
      await ev.action.showAlert();
      return;
    }

    const reply = await goodbit('/v1/latest/tag', { method: 'POST', body: { tag } });
    if (succeeded(reply)) {
      await ev.action.showOk();
      return;
    }

    await ev.action.setTitle(reply.body.saving ? 'Saving…' : 'No');
    await ev.action.showAlert();
    // Put the key's own label back, so a refusal does not stay painted on it.
    setTimeout(() => void ev.action.setTitle(tag), 2000);
  }
}
