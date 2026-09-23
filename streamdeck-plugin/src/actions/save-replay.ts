import { action, type KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';

/**
 * Save the replay buffer.
 *
 * GoodBit presses the key OBS already has bound for it and answers only once
 * a new recording has actually landed, so the tick means a file exists. That
 * can take a few seconds for a long buffer, which is why this one waits
 * longer than the other keys and says "Saving" while it does.
 *
 * When it does not work the key says which of the usual reasons it was,
 * rather than only the alert triangle, because each has a different fix.
 */
const REASONS: Record<string, string> = {
  'obs-off': 'OBS\noff',
  'no-hotkey': 'No key\nin OBS',
  'unsupported-key': 'Key not\nsupported',
  'nothing-landed': 'Buffer\noff?',
};

@action({ UUID: 'io.github.darrellvs.goodbit.save-replay' })
export class SaveReplay extends SingletonAction {
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    await ev.action.setTitle('Saving');
    const reply = await goodbit('/v1/replay/save', { method: 'POST', timeoutMs: 16_000 });
    if (succeeded(reply)) {
      await ev.action.setTitle('');
      await ev.action.showOk();
      return;
    }
    const reason = typeof reply.body.reason === 'string' ? REASONS[reply.body.reason] : undefined;
    await ev.action.setTitle(reply.status === 0 ? 'GoodBit\noff' : (reason ?? ''));
    await ev.action.showAlert();
    // The reason stays long enough to read, then the key goes back to its icon.
    setTimeout(() => void ev.action.setTitle(''), 4000);
  }
}
