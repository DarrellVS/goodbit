/**
 * How hard OBS compresses what it records.
 *
 * GoodBit does not encode the recording; OBS does, from a profile GoodBit
 * wrote earlier. So this is not a parameter passed at the moment a clip is
 * saved, it is a key in `[SimpleOutput]` that takes effect the next time the
 * profile is written, which cannot happen while OBS is running.
 *
 * **The values and their meanings were read off this machine's OBS**, not out
 * of documentation: the four tokens and their labels come from
 * `data/obs-studio/locale/en-US.ini` in the install, and the key's shape was
 * confirmed against a real `basic.ini` carrying `RecQuality=Small`. Nothing in
 * the OBS module here came from documentation and this is not the first thing
 * that will.
 *
 * ```
 * Basic.Settings.Output.Simple.RecordingQuality.Stream="Same as stream"
 * Basic.Settings.Output.Simple.RecordingQuality.Small="High Quality, Medium File Size"
 * Basic.Settings.Output.Simple.RecordingQuality.HQ="Indistinguishable Quality, Large File Size"
 * Basic.Settings.Output.Simple.RecordingQuality.Lossless="Lossless Quality, Tremendously Large File Size"
 * ```
 *
 * **Two of OBS's four are deliberately not offered.**
 *
 * `Stream` records at the streaming bitrate, which is a Twitch preset. Nothing
 * here streams, and a clip somebody is going to trim and share deserves better
 * than a bitrate chosen for an uplink that does not exist.
 *
 * `Lossless` cannot work in this app at all, and the reason is OBS's own:
 * *"Replay buffer is unavailable when using lossless quality."* Every clip
 * GoodBit files comes from the replay buffer, so offering it would be a
 * setting whose only effect is that pressing the key stops producing clips.
 * That is worse than not offering it. It is also why the container question,
 * `RecFormat2=mp4` against whatever OBS forces for lossless, never arises.
 *
 * Which leaves the two that differ only in how hard they squeeze, which is
 * what the setting was asked for.
 */

export type RecordingQuality = 'balanced' | 'indistinguishable';

/**
 * The default, and the value every existing install already has.
 *
 * `profileEdits()` wrote the literal `HQ` before this setting existed, so an
 * install that has never seen the dropdown must keep recording exactly as it
 * did. A default that quietly changed what OBS writes is a setting that
 * degrades somebody's recordings the first time the app updates.
 */
export const DEFAULT_RECORDING_QUALITY: RecordingQuality = 'indistinguishable';

/**
 * The token OBS stores in `[SimpleOutput] RecQuality`.
 *
 * Here rather than in `services/obs/setup.ts` for the same reason
 * `planAudioTracks` is shared: the wizard shows the choice while somebody is
 * making it and the setup writes it, and two copies of one mapping is how a
 * preview names a different value from the one that lands on disk.
 */
export function obsRecQuality(quality: RecordingQuality): string {
  return quality === 'balanced' ? 'Small' : 'HQ';
}

/** OBS's own words for each, shortened to fit a settings row. */
export const RECORDING_QUALITY_LABELS: Record<RecordingQuality, string> = {
  balanced: 'High quality, medium file size',
  indistinguishable: 'Indistinguishable quality, large file size',
};

export const RECORDING_QUALITY_DESCRIPTIONS: Record<RecordingQuality, string> = {
  balanced: 'Smaller files. Fine for clips you are going to share rather than cut.',
  indistinguishable: 'What GoodBit has always recorded. Hard to tell from the game itself.',
};
