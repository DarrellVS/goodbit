import { describe, expect, it } from 'vitest';
import { profileEdits } from '../../../src/main/services/obs/setup.js';
import {
  DEFAULT_RECORDING_QUALITY,
  obsRecQuality,
  RECORDING_QUALITY_LABELS,
  type RecordingQuality,
} from '../../../src/shared/index.js';

/**
 * Which token lands in `[SimpleOutput] RecQuality`.
 *
 * This is the one key in the whole OBS setup whose effect cannot be undone
 * afterwards. Everything else it writes is a thing that can be changed tonight
 * with every clip already recorded still fine; this decides what goes into the
 * file, so a mapping that writes the wrong token quietly degrades, or
 * quietly bloats, every recording made until somebody notices.
 *
 * `scripts/obs-apply-check.mjs` proves the value reaches a real profile on
 * disk, and cannot run while OBS is open. The mapping itself takes values and
 * returns values, so it belongs here, where it runs on every edit.
 */

function choices(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    videosRoot: 'D:\\Clips',
    createProfile: true,
    enableReplayBuffer: true,
    replayBufferSeconds: 30,
    bindHotkey: true,
    hotkey: 'OBS_KEY_F8',
    createScene: true,
    display: null,
    encoder: { encoder: 'nvenc_hevc', tenBit: true },
    audio: [],
    multiTrackAudio: true,
    captureDesktop: true,
    recordingQuality: DEFAULT_RECORDING_QUALITY,
    ...overrides,
  } as never;
}

function recQuality(overrides: Partial<Record<string, unknown>> = {}): string | undefined {
  return profileEdits(choices(overrides)).find(
    (edit) => edit.section === 'SimpleOutput' && edit.key === 'RecQuality',
  )?.value;
}

describe('obsRecQuality', () => {
  it('maps each offered quality to the token OBS stores', () => {
    // Read off this machine's OBS, not out of documentation: the tokens and
    // their meanings are in `data/obs-studio/locale/en-US.ini`, and the key's
    // shape was confirmed against a real `basic.ini` carrying
    // `RecQuality=Small`.
    expect(obsRecQuality('balanced')).toBe('Small');
    expect(obsRecQuality('indistinguishable')).toBe('HQ');
  });

  it('is named the way OBS names it, since the label is what somebody chooses by', () => {
    // OBS calls `Small` "High Quality, Medium File Size" and `HQ`
    // "Indistinguishable Quality, Large File Size", which reads backwards from
    // the token names and is the trap worth writing down.
    expect(RECORDING_QUALITY_LABELS.balanced).toMatch(/medium file size/i);
    expect(RECORDING_QUALITY_LABELS.indistinguishable).toMatch(/indistinguishable/i);
  });
});

describe('profileEdits, RecQuality', () => {
  it('writes the token for the quality it was given', () => {
    expect(recQuality({ recordingQuality: 'balanced' })).toBe('Small');
    expect(recQuality({ recordingQuality: 'indistinguishable' })).toBe('HQ');
  });

  it('defaults to what every existing install already has', () => {
    // `HQ` was hardcoded before this setting existed. A default that changed
    // it would degrade, or bloat, the recordings of everybody who updates and
    // never opens this dropdown.
    expect(recQuality()).toBe('HQ');
    expect(obsRecQuality(DEFAULT_RECORDING_QUALITY)).toBe('HQ');
  });

  it('never writes Lossless or Stream', () => {
    // Neither is offered, and neither is a matter of taste. OBS's own words:
    // "Replay buffer is unavailable when using lossless quality", and every
    // clip this app files comes out of the replay buffer, so lossless is the
    // setting whose only effect is that the key stops producing clips.
    // `Stream` records at a streaming bitrate, for an uplink that does not
    // exist here.
    for (const quality of ['balanced', 'indistinguishable'] as RecordingQuality[]) {
      expect(['Lossless', 'Stream']).not.toContain(recQuality({ recordingQuality: quality }));
    }
  });

  it('writes nothing about quality when there is no encoder to write it for', () => {
    // The whole encoder block is skipped on a machine where no encoder could
    // be chosen, and the quality belongs to that block: a quality without an
    // encoder is a setting on a profile that cannot record.
    expect(recQuality({ encoder: null })).toBeUndefined();
  });
});
