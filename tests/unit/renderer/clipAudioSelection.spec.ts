import { describe, expect, it } from 'vitest';
import {
  hasSelection,
  isMutedIn,
  soloed,
  volumeIn,
  withMuteToggled,
  withVolume,
} from '../../../src/renderer/src/utils/clipAudioSelection';
import type { ClipAudioTrack } from '../../../src/shared/index';

/**
 * The decisions a person makes about a clip's tracks, as a value.
 *
 * Two screens hold one of these: the trimmer, where it lasts as long as the
 * screen, and the editor, where it lives on the timeline clip and is saved
 * with the draft. The rules are here so there is one answer to "what does
 * pressing mute twice do", rather than one answer per screen.
 *
 * The case worth protecting is the empty list. An untouched clip has to send
 * *no* selection, because a trim with one rebuilds the mix and a trim without
 * one copies the streams, so a decision that cancels itself out has to leave
 * nothing behind rather than an entry that says "not muted, 0 dB".
 */

function track(index: number, master = false): ClipAudioTrack {
  return {
    index,
    label: master ? 'Everything, mixed' : `Track ${index + 1}`,
    labelSource: 'obs',
    codec: 'aac',
    channels: 2,
    channelLayout: 'stereo',
    master,
  };
}

const tracks = [track(0, true), track(1), track(2)];

describe('clipAudioSelection', () => {
  it('starts with nothing decided', () => {
    expect(isMutedIn(undefined, 1)).toBe(false);
    // 1, not 0: an unmentioned track is at the level it was recorded at.
    expect(volumeIn(undefined, 1)).toBe(1);
    expect(hasSelection(undefined)).toBe(false);
    expect(hasSelection([])).toBe(false);
  });

  it('mutes and unmutes back to nothing', () => {
    const muted = withMuteToggled([], 2);
    expect(muted).toEqual([{ index: 2, muted: true }]);

    // Not `[{ index: 2, muted: false }]`. An entry that says nothing is still
    // a selection, and a selection makes the trim rebuild a mix it could have
    // copied.
    expect(withMuteToggled(muted, 2)).toEqual([]);
  });

  it('keeps a level through a mute and back', () => {
    const quiet = withVolume([], 1, 0.5);
    const muted = withMuteToggled(quiet, 1);

    expect(muted).toEqual([{ index: 1, muted: true, volume: 0.5 }]);
    expect(volumeIn(withMuteToggled(muted, 1), 1)).toBe(0.5);
  });

  it('drops a level put back to where it was recorded', () => {
    // Back to 1 is not a decision, and an entry saying so would make an
    // untouched clip rebuild its mix instead of copying the streams.
    expect(withVolume(withVolume([], 1, 0.5), 1, 1)).toEqual([]);
  });

  it('holds decisions about several tracks at once, in order', () => {
    const selection = withVolume(withMuteToggled([], 2), 1, 1.4);

    expect(selection.map((entry: { index: number }) => entry.index)).toEqual([1, 2]);
    expect(isMutedIn(selection, 2)).toBe(true);
    expect(volumeIn(selection, 1)).toBe(1.4);
  });

  it('solos by muting the others, leaving the mix out of it', () => {
    const selection = soloed([], tracks, 1);

    // The master is every other track summed, so soloing against it would be
    // soloing a track against itself.
    expect(selection).toEqual([{ index: 2, muted: true }]);
  });

  it('puts everything back when the same track is soloed twice', () => {
    const once = soloed([], tracks, 1);
    expect(soloed(once, tracks, 1)).toEqual([]);
  });

  it('moves the solo rather than stacking it', () => {
    const first = soloed([], tracks, 1);
    expect(soloed(first, tracks, 2)).toEqual([{ index: 1, muted: true }]);
  });
});
