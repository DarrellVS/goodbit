import type { ObsAudioTrack } from '../dtos/obs/ObsDTO.js';

/**
 * An audio endpoint, as much of one as this needs to know.
 *
 * Structural rather than `AudioDevice` from main, because `src/shared` may not
 * import from `src/main` and this has to run in both: the window draws the
 * routing plan live while somebody is ticking devices, and the setup writes
 * the same plan into OBS. Two implementations of one bitmask is how the
 * preview and the write end up disagreeing about which track voice chat is on.
 */
export interface AudioDeviceLike {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
}

/**
 * Which sound lands on which track, worked out before anything is written.
 *
 * OBS mixes every audio source into one stream unless it is told otherwise,
 * and one stream is one decision made at record time that can never be taken
 * back: a friend chewing on voice chat is in the same samples as the gunfire.
 * Recording each source on its own track leaves that decision for later, which
 * is the whole of issue #7 and the thing issue #6 acts on.
 *
 * Two keys do it, and both are bitmasks:
 *
 * - `[SimpleOutput] RecTracks` in the profile: which tracks are written to the
 *   file. Bit 0 is track 1. Absent, OBS records track 1 alone, which is why a
 *   collection full of `mixers: 255` still produced a single stream.
 * - `mixers` on each source in the scene collection: which tracks that source
 *   feeds. 255 is all eight, which is what "everything into everything" looks
 *   like written down.
 *
 * Checked against the OBS on this machine rather than read anywhere: 32.2.2's
 * own settings UI carries `simpleOutRecTrack1` through `simpleOutRecTrack6`,
 * so Simple output mode has six tracks and no switch to Advanced is needed,
 * and a real recording off this library holds six aac streams in an mp4, so
 * the container is not the limit either.
 */

/** OBS has six tracks. Not a limit worth being clever about. */
export const OBS_MAX_TRACKS = 6;

/** Track 1 is the mix, so this many sources can have one of their own. */
export const ISOLATED_TRACK_SLOTS = OBS_MAX_TRACKS - 1;

/** Every track, which is what a single-track setup writes on every source. */
export const ALL_TRACKS_MASK = 255;

/** Just track 1. */
export const MASTER_MASK = 1;

export interface AudioTrackPlan {
  /** Whether anything is being separated at all. */
  multiTrack: boolean;
  /** `[SimpleOutput] RecTracks`. */
  recTracks: number;
  /** The `mixers` bitmask for each device, in the order they were given. */
  mixers: number[];
  /**
   * What the capture sources get.
   *
   * Game capture can carry audio of its own, and under a multi-track plan it
   * belongs in the mix and nowhere else: a source with no track of its own
   * that is fed into every track would put game sound on the voice chat track,
   * which is precisely the thing being separated.
   */
  captureMixers: number;
  /** What each recorded track carries, track 1 first. */
  tracks: ObsAudioTrack[];
  /**
   * Devices past the sixth track, which only reach the mix.
   *
   * Six is OBS's own limit and one of them is the mix, so a Wave Link setup
   * with six virtual outputs has one that cannot be isolated. Said out loud in
   * the preview rather than dropped quietly.
   */
  overflow: string[];
}

/**
 * What the OBS mixer calls a device.
 *
 * Shared with `buildCollection` so the name in the mixer and the name on the
 * track are the same string. Two spellings of one device is how a person ends
 * up muting the wrong track.
 */
export function audioSourceName(device: AudioDeviceLike): string {
  if (device.isDefault) return 'Desktop audio';
  return device.description ? `${device.name} (${device.description})` : device.name;
}

/**
 * The routing plan for a set of devices.
 *
 * Three shapes, and the first two are deliberately no change at all:
 *
 * - **Nothing chosen.** A silent recording, which is a choice someone can make.
 * - **One device.** Nothing to separate. Track 1 alone, `mixers` left at 255,
 *   so a person who never thought about this gets exactly what they got before.
 * - **Two or more.** Track 1 is the full mix, so anything that reads only the
 *   first track (a browser, Discord, ffmpeg's own default) still hears
 *   everything, and tracks 2 upward carry one source each.
 */
export function planAudioTracks(
  devices: AudioDeviceLike[],
  enabled = true,
): AudioTrackPlan {
  if (devices.length === 0) {
    return {
      multiTrack: false,
      recTracks: MASTER_MASK,
      mixers: [],
      captureMixers: ALL_TRACKS_MASK,
      tracks: [],
      overflow: [],
    };
  }

  if (!enabled || devices.length === 1) {
    return {
      multiTrack: false,
      recTracks: MASTER_MASK,
      mixers: devices.map(() => ALL_TRACKS_MASK),
      captureMixers: ALL_TRACKS_MASK,
      tracks: [
        {
          track: 1,
          label:
            devices.length === 1
              ? audioSourceName(devices[0])
              : `Everything, mixed: ${devices.map(audioSourceName).join(', ')}`,
          deviceId: devices.length === 1 ? devices[0].id : null,
          master: true,
        },
      ],
      overflow: devices.length === 1 ? [] : devices.map(audioSourceName),
    };
  }

  const isolated = devices.slice(0, ISOLATED_TRACK_SLOTS);
  const overflow = devices.slice(ISOLATED_TRACK_SLOTS);
  const usedTracks = isolated.length + 1;

  return {
    multiTrack: true,
    // Bits 0 through `usedTracks - 1`, which is every track being written to.
    recTracks: (1 << usedTracks) - 1,
    mixers: devices.map((_device, index) =>
      index < ISOLATED_TRACK_SLOTS ? MASTER_MASK | (1 << (index + 1)) : MASTER_MASK,
    ),
    captureMixers: MASTER_MASK,
    tracks: [
      { track: 1, label: 'Everything, mixed', deviceId: null, master: true },
      ...isolated.map((device, index) => ({
        track: index + 2,
        label: audioSourceName(device),
        deviceId: device.id,
        master: false,
      })),
    ],
    overflow: overflow.map(audioSourceName),
  };
}

/**
 * The plan in sentences, for the preview.
 *
 * The preview is what consent is given to, so it says which sound lands where
 * rather than printing a bitmask nobody can read back.
 */
export function describeAudioTracks(plan: AudioTrackPlan): string[] {
  if (plan.tracks.length === 0) {
    return ['No sound is recorded, because no audio device was chosen'];
  }

  if (!plan.multiTrack) {
    return [`Sound comes from ${plan.tracks[0].label.toLowerCase()}, on one track`];
  }

  const lines = [
    `Sound is recorded on ${plan.tracks.length} tracks, so one of them can be turned down later`,
    ...plan.tracks.map((track) =>
      track.master
        ? `Track ${track.track}: everything mixed together, which is what anything that reads one track hears`
        : `Track ${track.track}: ${track.label}, on its own`,
    ),
  ];

  if (plan.overflow.length > 0) {
    lines.push(
      `OBS has six tracks and one of them is the mix, so ${plan.overflow.join(
        ', ',
      )} reaches the mix without a track of its own`,
    );
  }

  return lines;
}
