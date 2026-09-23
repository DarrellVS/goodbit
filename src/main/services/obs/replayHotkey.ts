/**
 * The key OBS saves the replay on, as something Windows can press.
 *
 * GoodBit has no channel into OBS, and opening one means obs-websocket: a
 * server OBS binds to every interface once it is switched on, and a config of
 * OBS's own to write. So the Stream Deck's save key presses the hotkey OBS
 * already listens for, the one the setup bound (F8 unless somebody picked
 * another) or whatever the user bound by hand. Nothing in OBS changes and
 * nothing listens on the network.
 *
 * Pure, so the mapping from OBS's names to Windows virtual keys is owned by
 * `tests/unit`: a wrong entry here presses a different key in somebody's game.
 */

export interface KeyChord {
  /** A Windows virtual-key code. */
  vk: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** How OBS writes it, for messages. */
  label: string;
}

/** OBS key names that are not a letter, a digit or F1 to F24. */
const NAMED: Record<string, number> = {
  OBS_KEY_SPACE: 0x20,
  OBS_KEY_RETURN: 0x0d,
  OBS_KEY_ENTER: 0x0d,
  OBS_KEY_TAB: 0x09,
  OBS_KEY_BACKSPACE: 0x08,
  OBS_KEY_ESCAPE: 0x1b,
  OBS_KEY_INSERT: 0x2d,
  OBS_KEY_DELETE: 0x2e,
  OBS_KEY_HOME: 0x24,
  OBS_KEY_END: 0x23,
  OBS_KEY_PAGEUP: 0x21,
  OBS_KEY_PAGEDOWN: 0x22,
  OBS_KEY_LEFT: 0x25,
  OBS_KEY_UP: 0x26,
  OBS_KEY_RIGHT: 0x27,
  OBS_KEY_DOWN: 0x28,
  OBS_KEY_PAUSE: 0x13,
  OBS_KEY_PRINT: 0x2c,
  OBS_KEY_SCROLLLOCK: 0x91,
  OBS_KEY_NUMLOCK: 0x90,
  OBS_KEY_NUMASTERISK: 0x6a,
  OBS_KEY_NUMPLUS: 0x6b,
  OBS_KEY_NUMMINUS: 0x6d,
  OBS_KEY_NUMPERIOD: 0x6e,
  OBS_KEY_NUMSLASH: 0x6f,
  OBS_KEY_MINUS: 0xbd,
  OBS_KEY_EQUAL: 0xbb,
  OBS_KEY_COMMA: 0xbc,
  OBS_KEY_PERIOD: 0xbe,
  OBS_KEY_SLASH: 0xbf,
  OBS_KEY_SEMICOLON: 0xba,
  OBS_KEY_APOSTROPHE: 0xde,
  OBS_KEY_BRACKETLEFT: 0xdb,
  OBS_KEY_BRACKETRIGHT: 0xdd,
  OBS_KEY_BACKSLASH: 0xdc,
  OBS_KEY_ASCIITILDE: 0xc0,
  OBS_KEY_QUOTELEFT: 0xc0,
};

/** Windows' virtual key for an OBS key name, or null for one this does not know. */
export function virtualKey(obsKey: string): number | null {
  const letter = /^OBS_KEY_([A-Z])$/.exec(obsKey);
  if (letter) return letter[1].charCodeAt(0);

  const digit = /^OBS_KEY_([0-9])$/.exec(obsKey);
  if (digit) return 0x30 + Number(digit[1]);

  const numpad = /^OBS_KEY_NUM([0-9])$/.exec(obsKey);
  if (numpad) return 0x60 + Number(numpad[1]);

  const fn = /^OBS_KEY_F([0-9]{1,2})$/.exec(obsKey);
  if (fn) {
    const n = Number(fn[1]);
    return n >= 1 && n <= 24 ? 0x70 + n - 1 : null;
  }

  return NAMED[obsKey] ?? null;
}

/**
 * The first binding for saving the replay, from the raw `[Hotkeys]` value.
 *
 * Both shapes OBS has used: the modern `{"bindings":[...]}` and the output's
 * own `{"ReplayBuffer.Save":[...]}`, which is the one that works on OBS 31 and
 * the one the setup writes. Null when nothing is bound, or when the key is one
 * this cannot press, which the caller says in words rather than guessing.
 */
export function replayChord(raw: string | null): KeyChord | { unsupported: string } | null {
  if (!raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const bindings = (parsed.bindings ?? parsed['ReplayBuffer.Save']) as
    | Array<Record<string, unknown>>
    | undefined;
  const first = bindings?.find((binding) => typeof binding?.key === 'string');
  if (!first) return null;

  const key = first.key as string;
  const vk = virtualKey(key);
  const label = [
    first.control ? 'Ctrl' : null,
    first.alt ? 'Alt' : null,
    first.shift ? 'Shift' : null,
    key.replace(/^OBS_KEY_/, ''),
  ]
    .filter(Boolean)
    .join(' + ');

  if (vk === null) return { unsupported: label };
  return { vk, ctrl: Boolean(first.control), alt: Boolean(first.alt), shift: Boolean(first.shift), label };
}
