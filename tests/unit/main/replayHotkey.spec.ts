import { describe, expect, it } from 'vitest';
import { replayChord, virtualKey } from '../../../src/main/services/obs/replayHotkey';

/*
 * A wrong entry here presses a different key in somebody's game, so the
 * mapping is held to Windows' own virtual-key table.
 */
describe('virtualKey', () => {
  it.each([
    ['OBS_KEY_F8', 0x77],
    ['OBS_KEY_F1', 0x70],
    ['OBS_KEY_F24', 0x87],
    ['OBS_KEY_A', 0x41],
    ['OBS_KEY_Z', 0x5a],
    ['OBS_KEY_0', 0x30],
    ['OBS_KEY_9', 0x39],
    ['OBS_KEY_NUM0', 0x60],
    ['OBS_KEY_NUM9', 0x69],
    ['OBS_KEY_INSERT', 0x2d],
    ['OBS_KEY_PAUSE', 0x13],
    ['OBS_KEY_PAGEUP', 0x21],
  ])('%s is 0x%s', (name, vk) => {
    expect(virtualKey(name)).toBe(vk);
  });

  it('knows nothing it was not told, rather than guessing', () => {
    expect(virtualKey('OBS_KEY_F25')).toBeNull();
    expect(virtualKey('OBS_KEY_MOUSE4')).toBeNull();
    expect(virtualKey('OBS_KEY_WHATEVER')).toBeNull();
  });
});

describe('replayChord', () => {
  it('reads what the setup writes', () => {
    expect(replayChord(JSON.stringify({ 'ReplayBuffer.Save': [{ key: 'OBS_KEY_F8' }] }))).toEqual({
      vk: 0x77,
      ctrl: false,
      alt: false,
      shift: false,
      label: 'F8',
    });
  });

  it('reads the modern shape, modifiers and all', () => {
    const chord = replayChord(
      JSON.stringify({ bindings: [{ key: 'OBS_KEY_R', control: true, shift: true }] }),
    );
    expect(chord).toEqual({ vk: 0x52, ctrl: true, alt: false, shift: true, label: 'Ctrl + Shift + R' });
  });

  it('says which key it cannot press, instead of pressing something else', () => {
    expect(replayChord(JSON.stringify({ bindings: [{ key: 'OBS_KEY_MOUSE4' }] }))).toEqual({
      unsupported: 'MOUSE4',
    });
  });

  it('is null when nothing is bound or the value is not JSON', () => {
    expect(replayChord(null)).toBeNull();
    expect(replayChord('{}')).toBeNull();
    expect(replayChord('not json')).toBeNull();
    expect(replayChord(JSON.stringify({ bindings: [] }))).toBeNull();
  });
});
