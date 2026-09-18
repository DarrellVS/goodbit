/**
 * The sound in a clip, once it is more than one thing.
 *
 * A recording made through GoodBit's own OBS setup carries a track per source:
 * the mix on track 1, then game, voice chat, music, each on its own. Nothing
 * downstream can use that without knowing which stream is which, which is what
 * these two shapes are for. `ClipAudioTrack` is what a clip has;
 * `ClipAudioSelection` is what someone decided about it.
 *
 * Neither is stored on the clip. A track selection is an export-time decision,
 * the same way a crop is: the recording keeps every track, and a trim carries
 * the decision into the file it writes because a trim replaces the recording.
 */

export interface ClipAudioTrack {
  /**
   * Which audio stream this is, counted among the audio streams alone.
   *
   * So `-map 0:a:<index>`, not the absolute stream index: in an OBS recording
   * the video is stream 0 and the first audio track is stream 1, and mixing
   * the two numbering schemes maps the wrong sound.
   */
  index: number;
  /** What to call it, which is a device name when GoodBit set the OBS up. */
  label: string;
  /**
   * Where the label came from, so the interface can be honest about a guess.
   *
   * `obs` is the scene collection's own device name; `stream` is a title the
   * file itself carries; `index` is "Track 3" and means nobody knows.
   */
  labelSource: 'obs' | 'stream' | 'index';
  codec: string | null;
  channels: number | null;
  channelLayout: string | null;
  /**
   * The full mix, which every other track is a part of.
   *
   * True for track 1 of a GoodBit multi-track recording. It matters because
   * muting a source cannot be done by keeping this track: the muted sound is
   * already in these samples, so a selection that changes anything has to
   * rebuild the mix out of the tracks that were kept.
   */
  master: boolean;
}

export interface ClipAudioSelection {
  /** Matches `ClipAudioTrack.index`. */
  index: number;
  /** Left out of the output entirely. */
  muted?: boolean;
  /**
   * A multiplier, where 1 is the level it was recorded at.
   *
   * Linear rather than decibels, because that is what everything else in this
   * app means by volume: a clip's fader on the timeline, `ProjectTimelineClip`
   * and the `volume=` filter the export already writes all work this way, and
   * one screen showing a track in dB beside a clip in percent would be two
   * units for one idea. The interface shows it as a percentage.
   */
  volume?: number;
}
