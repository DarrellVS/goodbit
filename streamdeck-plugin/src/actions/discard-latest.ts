import {
  action,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from '@elgato/streamdeck';
import { goodbit, succeeded } from '../goodbit.js';
import { GLYPHS } from '../glyphs.js';

/** How long the key has to be held before it throws anything away. */
const HOLD_MS = 1200;
/** How often the key's face is brought up to date with the newest clip. */
const POLL_MS = 5000;

interface Preview {
  id?: number;
  title?: string;
  thumbnail?: string | null;
  allowed?: boolean;
  discardable?: boolean;
  reason?: string | null;
  saving?: boolean;
  none?: boolean;
}

type Key = {
  id: string;
  setImage(image?: string): Promise<void>;
  setTitle(title?: string): Promise<void>;
  showOk(): Promise<void>;
  showAlert(): Promise<void>;
};

/**
 * Throw away the clip you just saved, on a long press, **and show which one
 * first**.
 *
 * The key's face is the newest clip's own thumbnail, dimmed, with a trash
 * mark when a hold would discard it and a lock when GoodBit would keep it (it
 * carries a name, tags, notes, marks, a star or a public link), or when
 * discarding is switched off in GoodBit. A hold that ended in "Kept" used to
 * be the first sign of any of that.
 *
 * **The hold fires on its own at 1.2 s**, while the key is still down, rather
 * than on release: nobody has to guess how long is long enough. A shorter
 * press does nothing but say "Hold". GoodBit still decides, not this plugin:
 * it refuses a discard without `confirm`, and re-checks the rules itself.
 */
@action({ UUID: 'io.github.darrellvs.goodbit.discard-latest' })
export class DiscardLatest extends SingletonAction {
  private readonly holds = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly polls = new Map<string, ReturnType<typeof setInterval>>();
  private readonly shown = new Map<string, string>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const key = ev.action;
    if (!key.isKey()) return;
    await this.refresh(key);
    this.polls.set(key.id, setInterval(() => void this.refresh(key), POLL_MS));
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    clearInterval(this.polls.get(ev.action.id));
    this.polls.delete(ev.action.id);
    this.shown.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const key = ev.action;
    await key.setTitle('Hold');
    this.holds.set(
      key.id,
      setTimeout(() => {
        this.holds.delete(key.id);
        void this.discard(key);
      }, HOLD_MS),
    );
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const timer = this.holds.get(ev.action.id);
    if (!timer) return; // It already fired.
    clearTimeout(timer);
    this.holds.delete(ev.action.id);
    await ev.action.setTitle('Hold');
    setTimeout(() => void ev.action.setTitle(''), 1500);
  }

  private async discard(key: Key): Promise<void> {
    await key.setTitle('');
    // `confirm` is the long press, said to the server in words.
    const reply = await goodbit('/v1/latest/discard', { method: 'POST', body: { confirm: true } });
    if (succeeded(reply)) {
      await key.showOk();
    } else {
      await key.setTitle(typeof reply.body.reason === 'string' ? 'Kept' : reply.status === 403 ? 'Off' : 'No');
      await key.showAlert();
      setTimeout(() => void key.setTitle(''), 2000);
    }
    this.shown.delete(key.id);
    await this.refresh(key);
  }

  /** Put the newest clip on the key, redrawing only when something changed. */
  private async refresh(key: Key): Promise<void> {
    const reply = await goodbit('/v1/latest/preview');
    const preview = (succeeded(reply) ? reply.body : {}) as Preview;
    const image = face(preview);
    if (this.shown.get(key.id) === image) return;
    this.shown.set(key.id, image);
    await key.setImage(image || undefined);
  }
}

/**
 * The key's face as an SVG data URL, or '' for the plain icon from the manifest.
 *
 * 144 square. The thumbnail arrives already cropped square by GoodBit (the
 * Stream Deck's SVG renderer ignores `slice` and would squash a wide frame),
 * and fills the key at nearly full brightness, because the
 * picture is the point of the key: darkening the whole frame so the mark read
 * made the clip itself unreadable on the LCD. The mark sits on a small dark
 * disc of its own instead, trash in the danger colour, or a lock in the light
 * one for a clip that would be kept, which is dimmed a little more so it reads
 * as not on offer.
 */
function face(preview: Preview): string {
  if (!preview.thumbnail) return '';
  const kept = preview.allowed === false || preview.discardable === false;
  const glyph = kept ? GLYPHS.lock : GLYPHS.trash;
  const colour = kept ? '#f2efea' : '#d45757';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#121110"/>
    <image x="0" y="0" width="144" height="144" xlink:href="${preview.thumbnail}"/>
    <rect width="144" height="144" fill="#121110" opacity="${kept ? 0.3 : 0.08}"/>
    <circle cx="72" cy="72" r="30" fill="#121110" opacity="0.72"/>
    <g transform="translate(50 50) scale(0.171875)" fill="${colour}">${glyph}</g>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
