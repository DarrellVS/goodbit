import { describe, expect, it } from 'vitest';
import {
  ALL_TRACKS_MASK,
  ISOLATED_TRACK_SLOTS,
  OBS_MAX_TRACKS,
  planAudioTracks,
  describeAudioTracks,
} from '../../../src/main/services/obs/audioTracks.js';

/**
 * Which sound lands on which track.
 *
 * Two bitmasks have to agree or the recording is silently wrong, and wrong
 * here is not a crash: it is six identical streams, or a voice chat track
 * holding the game as well, neither of which looks like anything until
 * somebody tries to mute one of them months later. So the masks are asserted
 * as numbers.
 *
 * The arithmetic itself is the reason this is a unit test rather than a bench:
 * `1 << (index + 1)` is the whole feature, and an off-by-one there routes
 * every source one track along.
 */

function device(name: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id: `{${name}}`,
    name,
    description: null,
    isDefault: false,
    flow: 'output' as const,
    ...extra,
  } as never;
}

describe('planAudioTracks', () => {
  it('leaves a single device exactly as it was', () => {
    const plan = planAudioTracks([device('Speakers')]);

    expect(plan.multiTrack).toBe(false);
    // Track 1 alone, and the source feeding everything, which is what every
    // GoodBit setup wrote before any of this existed.
    expect(plan.recTracks).toBe(1);
    expect(plan.mixers).toEqual([ALL_TRACKS_MASK]);
    expect(plan.captureMixers).toBe(ALL_TRACKS_MASK);
  });

  it('records nothing for no devices, without claiming a track', () => {
    const plan = planAudioTracks([]);

    expect(plan.tracks).toEqual([]);
    expect(plan.mixers).toEqual([]);
    expect(plan.recTracks).toBe(1);
  });

  it('puts two devices on a mix plus one track each', () => {
    const plan = planAudioTracks([device('Game'), device('Voice chat')]);

    expect(plan.multiTrack).toBe(true);
    // Tracks 1, 2 and 3: 0b111.
    expect(plan.recTracks).toBe(7);
    // Track 1 plus track 2, then track 1 plus track 3.
    expect(plan.mixers).toEqual([0b011, 0b101]);
    expect(plan.tracks.map((track) => track.track)).toEqual([1, 2, 3]);
    expect(plan.tracks[0].master).toBe(true);
    expect(plan.tracks[1].label).toBe('Game');
    expect(plan.tracks[2].label).toBe('Voice chat');
  });

  it('keeps every source in the mix, whatever else it feeds', () => {
    const plan = planAudioTracks([device('a'), device('b'), device('c')]);

    // The master bit is what makes a recording still play in anything that
    // reads one track, which is most things. Losing it is the failure that
    // would not show up until a clip reached Discord.
    for (const mask of plan.mixers) expect(mask & 1).toBe(1);
  });

  it('gives no two sources the same isolated track', () => {
    const plan = planAudioTracks([device('a'), device('b'), device('c'), device('d')]);
    const isolated = plan.mixers.map((mask) => mask & ~1);

    expect(new Set(isolated).size).toBe(isolated.length);
  });

  it('sends the sources past OBS’s six tracks to the mix, and says so', () => {
    const many = Array.from({ length: 7 }, (_unused, index) => device(`d${index}`));
    const plan = planAudioTracks(many);

    expect(plan.recTracks).toBe((1 << OBS_MAX_TRACKS) - 1);
    expect(plan.tracks).toHaveLength(OBS_MAX_TRACKS);
    // The last two reach track 1 and nothing else, rather than being dropped
    // or silently sharing track 6 with somebody else.
    expect(plan.mixers.slice(ISOLATED_TRACK_SLOTS)).toEqual([1, 1]);
    expect(plan.overflow).toEqual(['d5', 'd6']);
    expect(describeAudioTracks(plan).join(' ')).toContain('d5, d6');
  });

  it('writes the single-track shape when the choice is refused', () => {
    const plan = planAudioTracks([device('Game'), device('Voice chat')], false);

    expect(plan.multiTrack).toBe(false);
    expect(plan.recTracks).toBe(1);
    expect(plan.mixers).toEqual([ALL_TRACKS_MASK, ALL_TRACKS_MASK]);
  });

  it('names the default endpoint the way the OBS mixer does', () => {
    const plan = planAudioTracks([
      device('Speakers', { isDefault: true }),
      device('Wave Link', { description: 'Elgato Virtual Audio' }),
    ]);

    expect(plan.tracks[1].label).toBe('Desktop audio');
    expect(plan.tracks[2].label).toBe('Wave Link (Elgato Virtual Audio)');
  });

  it('keeps game capture out of the isolated tracks', () => {
    const plan = planAudioTracks([device('Game'), device('Voice chat')]);

    // Game capture carries sound of its own. Feeding it into every track would
    // put game audio on the voice chat track, which is the one thing being
    // separated here.
    expect(plan.captureMixers).toBe(1);
  });
});
