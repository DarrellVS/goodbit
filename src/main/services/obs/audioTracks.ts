/**
 * Which sound lands on which track.
 *
 * The whole of it is in `src/shared`, because both processes need the same
 * answer: the setup writes the bitmasks into OBS, and the wizard draws the
 * routing plan live while somebody is still ticking devices. Two copies of one
 * `1 << (index + 1)` is how a preview ends up naming a different track from
 * the one that gets written.
 *
 * Re-exported from here so every caller in main keeps the import it had, and
 * so the OBS-specific reasoning stays next to the rest of `services/obs/`.
 */
export {
  OBS_MAX_TRACKS,
  ISOLATED_TRACK_SLOTS,
  ALL_TRACKS_MASK,
  MASTER_MASK,
  audioSourceName,
  planAudioTracks,
  describeAudioTracks,
  type AudioTrackPlan,
  type AudioDeviceLike,
} from '@shared/index.js';
