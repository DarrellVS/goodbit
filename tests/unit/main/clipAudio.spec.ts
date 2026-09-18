import { describe, expect, it } from 'vitest';
import {
  describeClipAudioTracks,
  keepsEveryTrack,
  planMixedAudio,
  planTrimAudio,
} from '../../../src/main/services/clipAudio.js';
import type { ClipAudioTrack, ObsAudioTrack } from '../../../src/shared/index.js';

/**
 * Muting one track out of six, which is a thing with exactly one visible
 * failure mode and several invisible ones.
 *
 * The visible one is a command that will not run. The invisible ones are worse
 * and are what these assert: a mix carried across unchanged, so the muted
 * voice chat is still audible in track 1 and the feature silently did nothing;
 * a track index read as a stream index, so the wrong sound goes quiet; a
 * `-c:a copy` claiming the streams beside a rebuilt one.
 */

function obsTrack(track: number, label: string, master = false): ObsAudioTrack {
  return { track, label, deviceId: master ? null : `{${label}}`, master };
}

function streams(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    index: index + 1,
    codec_name: 'aac',
    channels: 2,
    channel_layout: 'stereo',
  }));
}

/** A clip recorded through GoodBit's own multi-track setup. */
function mapped(): ClipAudioTrack[] {
  return describeClipAudioTracks(streams(3), [
    obsTrack(1, 'Everything, mixed', true),
    obsTrack(2, 'Game'),
    obsTrack(3, 'Voice chat'),
  ]);
}

describe('describeClipAudioTracks', () => {
  it('names the tracks when the mapping fits the file', () => {
    const tracks = mapped();

    expect(tracks.map((track) => track.label)).toEqual([
      'Everything, mixed',
      'Game',
      'Voice chat',
    ]);
    expect(tracks[0].master).toBe(true);
    // Counted among the audio streams, not among the file's streams: the video
    // is stream 0, so ffprobe's own index is one ahead throughout.
    expect(tracks.map((track) => track.index)).toEqual([0, 1, 2]);
  });

  it('refuses a mapping that does not fit, rather than labelling half of it', () => {
    // The setup has been changed since this was recorded. Naming stream 3
    // "voice chat" on the strength of a mapping that describes a different
    // recording is how somebody mutes the game.
    const tracks = describeClipAudioTracks(streams(6), [
      obsTrack(1, 'Everything, mixed', true),
      obsTrack(2, 'Game'),
    ]);

    expect(tracks.map((track) => track.label)).toEqual([
      'Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5', 'Track 6',
    ]);
    expect(tracks.every((track) => track.labelSource === 'index')).toBe(true);
    expect(tracks.some((track) => track.master)).toBe(false);
  });

  it('takes a title out of the file when there is one', () => {
    const [track] = describeClipAudioTracks([
      { index: 1, codec_name: 'aac', tags: { title: 'Commentary' } },
    ]);

    expect(track.label).toBe('Commentary');
    expect(track.labelSource).toBe('stream');
  });
});

describe('planTrimAudio', () => {
  it('keeps one track of six identical copies, as it always did', () => {
    const tracks = describeClipAudioTracks(streams(6));

    expect(keepsEveryTrack(tracks)).toBe(false);
    const plan = planTrimAudio(tracks);
    expect(plan.args).toEqual(['-map', '0:a:0', '-c:a', 'copy']);
    expect(plan.reencoded).toBe(false);
  });

  it('carries every track across when they hold different things', () => {
    const plan = planTrimAudio(mapped());

    expect(plan.outputs).toBe(3);
    expect(plan.args.filter((arg) => arg.startsWith('0:a:'))).toEqual(['0:a:0', '0:a:1', '0:a:2']);
    expect(plan.reencoded).toBe(false);
  });

  it('rebuilds the mix when a track underneath it is muted', () => {
    const plan = planTrimAudio(mapped(), [{ index: 2, muted: true }]);

    // The point of the whole feature. Track 1 already holds the voice chat, so
    // copying it across would mute nothing at all.
    expect(plan.filterComplex).toContain('[0:a:1]');
    expect(plan.filterComplex).not.toContain('[0:a:2]');
    expect(plan.filterComplex).toContain('[mix]');
    expect(plan.reencoded).toBe(true);
    // The mix, plus the one surviving isolated track.
    expect(plan.outputs).toBe(2);
  });

  it('sums the survivors without ducking them', () => {
    const plan = planTrimAudio(mapped(), [{ index: 1, volume: 0.5 }]);

    expect(plan.filterComplex).toContain('volume=0.500');
    expect(plan.filterComplex).toContain('amix=inputs=2');
    // amix divides by its input count unless told otherwise, which would turn
    // every export half as loud the moment a track was touched.
    expect(plan.filterComplex).toContain('normalize=0');
  });

  it('leaves the parts alone when only the mix is turned down', () => {
    const plan = planTrimAudio(mapped(), [{ index: 0, volume: 0.7 }]);

    // Nothing underneath moved, so the isolated tracks are still the recorded
    // bytes and only the mix is written again.
    expect(plan.filterComplex).toBe('[0:a:0]volume=0.700[ga0]');
    expect(plan.args).toContain('-c:a:1');
    expect(plan.args.filter((arg) => arg === 'copy')).toHaveLength(2);
  });

  it('never claims every stream with one codec flag', () => {
    const plan = planTrimAudio(mapped(), [{ index: 1, volume: 1.4 }]);

    // A bare `-c:a copy` beside a rebuilt stream copies the rebuilt one too,
    // which fails outright, and a bare `-c:a aac` re-encodes the streams that
    // were meant to be untouched.
    expect(plan.args).not.toContain('-c:a');
  });

  it('turns a single-track clip down without dropping it', () => {
    const tracks = describeClipAudioTracks(streams(1));
    const plan = planTrimAudio(tracks, [{ index: 0, volume: 0.25 }]);

    expect(plan.outputs).toBe(1);
    expect(plan.filterComplex).toBe('[0:a:0]volume=0.250[ga0]');
  });

  it('drops the mix when every part under it is muted', () => {
    const plan = planTrimAudio(mapped(), [
      { index: 1, muted: true },
      { index: 2, muted: true },
    ]);

    // Carrying track 1 across here would be the one outright lie available:
    // it holds every source that was just silenced.
    expect(plan.outputs).toBe(0);
    expect(plan.args).toEqual([]);
  });

  it('asks for nothing from a clip with no sound', () => {
    expect(planTrimAudio([]).args).toEqual(['-map', '0:a:0?']);
  });
});

describe('planMixedAudio', () => {
  it('takes the first stream as recorded when nothing was touched', () => {
    expect(planMixedAudio(mapped())).toEqual({
      filterComplex: null,
      map: '0:a:0?',
      changed: false,
    });
  });

  it('still applies the timeline fader on an untouched clip', () => {
    const plan = planMixedAudio(mapped(), [], 0.5);

    expect(plan.filterComplex).toBe('[0:a:0]volume=0.500[mixa0]');
    expect(plan.changed).toBe(false);
  });

  it('mixes the surviving parts rather than the master', () => {
    const plan = planMixedAudio(mapped(), [{ index: 2, muted: true }]);

    expect(plan.filterComplex).toContain('[0:a:1]');
    expect(plan.filterComplex).not.toContain('[0:a:2]');
    expect(plan.filterComplex).not.toContain('[0:a:0]');
    expect(plan.map).toBe('[mixa0]');
  });

  it('labels its filters by input, so a dissolve can read two files', () => {
    const plan = planMixedAudio(mapped(), [{ index: 1, muted: true }], 1, 1);

    expect(plan.filterComplex).toContain('[1:a:2]');
    expect(plan.map).toBe('[mixa1]');
  });

  it('gives a silent segment rather than no audio stream', () => {
    const plan = planMixedAudio(mapped(), [
      { index: 1, muted: true },
      { index: 2, muted: true },
    ]);

    // Every segment of an export has to carry the same streams or the concat
    // that joins them drops the sound from the one after it. Silence comes
    // from a real track turned all the way down, because `anullsrc` has no
    // length and would run until something else stopped it.
    expect(plan.filterComplex).toBe('[0:a:0]volume=0[mixa0]');
    expect(plan.map).toBe('[mixa0]');
  });
});
