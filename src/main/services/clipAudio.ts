import type { ClipAudioSelection, ClipAudioTrack, ObsAudioTrack } from '@shared/index.js';

/**
 * Turning "mute the voice chat" into ffmpeg arguments.
 *
 * A recording made through GoodBit's own OBS setup carries a track per source:
 * the mix on track 1, then game, voice chat, music, one each. That is issue #7.
 * This is what makes it worth having: a clip where a friend was chewing on
 * Discord is one mute away from being usable, rather than being re-recorded.
 *
 * Everything here takes values and returns values, so `tests/unit` owns it.
 * The arithmetic is small and the failure is invisible: an off-by-one between
 * a stream index and an audio-stream index maps the wrong sound and the clip
 * still plays perfectly, just with the wrong thing muted.
 *
 * **The master track is the part that is easy to get wrong.** Track 1 is every
 * source summed together, so it already holds the sound being muted: keeping
 * it and dropping track 4 mutes nothing at all. Whenever a selection changes
 * one of the isolated tracks, the mix has to be rebuilt out of the tracks that
 * were kept, which is the one place this re-encodes audio that nobody asked it
 * to touch.
 */

/**
 * How a rebuilt track is written back.
 *
 * aac at 192k, which is above what OBS recorded at (160k by default) so the
 * second generation is not the thing anybody hears. Per output stream rather
 * than globally, because the streams beside it are being copied and a bare
 * `-c:a` would claim all of them.
 */
export function rebuiltAudioArgs(output: number): string[] {
  return [`-c:a:${output}`, 'aac', `-b:a:${output}`, '192k'];
}

/** What ffprobe hands back for one audio stream, narrowed to what is used. */
export interface ProbedAudioStream {
  /** The stream's own index in the file, which is not its audio index. */
  index: number;
  codec_name?: string | null;
  channels?: number | null;
  channel_layout?: string | null;
  tags?: Record<string, string | undefined> | null;
}

/**
 * Put a name on each audio stream.
 *
 * Three sources of a name, in descending order of how much they are worth:
 *
 * - **The OBS mapping**, which is the only one that actually knows. It comes
 *   from the manifest the setup wrote, so it is available exactly when GoodBit
 *   configured the OBS that recorded this.
 * - **A title in the file.** OBS does not write one, but an imported clip cut
 *   in something else might.
 * - **The track number**, which is an admission that nobody knows.
 *
 * The mapping is only believed when it has a name for every track in the file.
 * A partial match means the setup has changed since this was recorded, and
 * half a mapping is worse than none: it would confidently label stream 3 as
 * voice chat when voice chat has since been moved to stream 4.
 */
export function describeClipAudioTracks(
  streams: ProbedAudioStream[],
  obsTracks: ObsAudioTrack[] = [],
): ClipAudioTrack[] {
  const mapped = obsTracks.length === streams.length && streams.length > 0;

  return streams.map((stream, index) => {
    const title = stream.tags?.title?.trim() || null;
    const fromObs = mapped ? obsTracks[index] : null;

    const label = fromObs?.label ?? title ?? `Track ${index + 1}`;
    const labelSource: ClipAudioTrack['labelSource'] = fromObs
      ? 'obs'
      : title
        ? 'stream'
        : 'index';

    return {
      index,
      label,
      labelSource,
      codec: stream.codec_name ?? null,
      channels: stream.channels ?? null,
      channelLayout: stream.channel_layout ?? null,
      // The mix, which every other track is part of. Only the OBS mapping can
      // say this: a file gives no hint that its first stream is a sum of the
      // other five.
      master: fromObs?.master ?? false,
    };
  });
}

interface ResolvedTrack {
  track: ClipAudioTrack;
  muted: boolean;
  /** A multiplier, where 1 is the recorded level. */
  volume: number;
  /** Whether this track is not exactly what was recorded. */
  changed: boolean;
}

function resolve(
  tracks: ClipAudioTrack[],
  selections: ClipAudioSelection[] = [],
): ResolvedTrack[] {
  return tracks.map((track) => {
    const chosen = selections.find((selection) => selection.index === track.index);
    const muted = chosen?.muted === true;
    const volume = Number.isFinite(chosen?.volume) ? (chosen?.volume as number) : 1;
    return { track, muted, volume, changed: muted || volume !== 1 };
  });
}

/**
 * A `volume` filter, or nothing at all when the level is untouched.
 *
 * Three places, three units: this multiplies. ffmpeg's own filter takes both a
 * bare multiplier and a `dB` suffix, and the rest of this app already speaks in
 * multipliers, so nothing here converts.
 */
function volumeFilter(volume: number): string | null {
  return volume === 1 ? null : `volume=${volume.toFixed(3)}`;
}

/**
 * Whether a trim should carry every track across by default.
 *
 * The old answer was always "keep the first and drop the rest", and it was
 * right for the library it was written against: a scene collection with
 * `mixers: 255` on every source writes six identical copies of one mix, so
 * five of them are pure file size. It is wrong the moment the tracks differ.
 *
 * Told apart by whether anything knows what the tracks hold. The OBS mapping
 * exists exactly when GoodBit wrote the setup that recorded this clip, which
 * is exactly when the tracks are one source each.
 */
export function keepsEveryTrack(tracks: ClipAudioTrack[]): boolean {
  return tracks.length > 1 && tracks.some((track) => track.labelSource === 'obs' && !track.master);
}

export interface ClipAudioArgs {
  /** `-filter_complex` value, or null when nothing has to be built. */
  filterComplex: string | null;
  /**
   * Everything after the filter: the maps and the per-stream codecs.
   *
   * One flat list because a caller passes it straight to `outputOptions`, and
   * the order of `-map` decides which output stream is which.
   */
  args: string[];
  /** Whether any audio is re-encoded, so the caller can say so. */
  reencoded: boolean;
  /** How many audio streams the output will have. */
  outputs: number;
}

/**
 * What a trim should do with the sound.
 *
 * A trim replaces the recording, so the decision has to be carried into the
 * file: this is the one place a track selection is not purely an export-time
 * thing. The tracks that were kept stay tracks, rather than being flattened,
 * so the clip can be remixed again tomorrow.
 */
export function planTrimAudio(
  tracks: ClipAudioTrack[],
  selections: ClipAudioSelection[] = [],
): ClipAudioArgs {
  if (tracks.length === 0) {
    // `?` rather than nothing: a clip with no sound at all is a clip, and a
    // hard `-map 0:a:0` on one fails the whole command.
    return { filterComplex: null, args: ['-map', '0:a:0?'], reencoded: false, outputs: 0 };
  }

  const resolved = resolve(tracks, selections);
  const touched = resolved.some((entry) => entry.changed);

  if (!touched) {
    const kept = keepsEveryTrack(tracks) ? resolved : resolved.slice(0, 1);
    return {
      filterComplex: null,
      args: [...kept.flatMap((entry) => ['-map', `0:a:${entry.track.index}`]), '-c:a', 'copy'],
      reencoded: false,
      outputs: kept.length,
    };
  }

  const master = resolved.find((entry) => entry.track.master) ?? null;
  const isolated = resolved.filter((entry) => !entry.track.master);
  const keptIsolated = isolated.filter((entry) => !entry.muted);

  /*
   * A clip with no isolated tracks, which is most of them.
   *
   * One recording, one stream, and turning it down is a `volume` filter and
   * nothing more. Also the shape for the old six-identical-copies library,
   * where only the first stream is carried across anyway.
   */
  if (isolated.length === 0) {
    const kept = (keepsEveryTrack(tracks) ? resolved : resolved.slice(0, 1)).filter(
      (entry) => !entry.muted,
    );
    const filters: string[] = [];
    const args: string[] = [];

    kept.forEach((entry, output) => {
      const level = volumeFilter(entry.volume);
      if (level) {
        filters.push(`[0:a:${entry.track.index}]${level}[ga${output}]`);
        args.push('-map', `[ga${output}]`, ...rebuiltAudioArgs(output));
      } else {
        args.push('-map', `0:a:${entry.track.index}`, `-c:a:${output}`, 'copy');
      }
    });

    return {
      filterComplex: filters.length ? filters.join(';') : null,
      args,
      reencoded: filters.length > 0,
      outputs: kept.length,
    };
  }

  /*
   * The mix is only rebuilt when something underneath it moved.
   *
   * Turning the master itself down is a filter on the master and leaves the
   * isolated tracks as recorded bytes. Muting voice chat is not: track 1
   * already holds that voice chat, so keeping it as recorded would mute
   * nothing, which is the failure that looks exactly like success.
   */
  const masterStale = master !== null && isolated.some((entry) => entry.changed);
  const filters: string[] = [];
  const args: string[] = [];
  let output = 0;

  const encode = (): void => {
    args.push(...rebuiltAudioArgs(output));
  };

  if (master && !master.muted && masterStale && keptIsolated.length === 0) {
    /*
     * Every part muted, so the mix is nothing.
     *
     * Copying the master across here is the one outcome that would be a lie:
     * it holds every source that was just silenced. No audio stream at all is
     * what "mute everything" means, and it is a shape a player understands.
     */
    return { filterComplex: null, args: [], reencoded: false, outputs: 0 };
  }

  if (master && !master.muted && masterStale && keptIsolated.length > 0) {
    // Every kept track feeds the mix and is also an output of its own, so each
    // one is split: a filter graph cannot read the same label twice.
    keptIsolated.forEach((entry, position) => {
      const level = volumeFilter(entry.volume);
      filters.push(
        `[0:a:${entry.track.index}]${level ? `${level},` : ''}asplit=2[k${position}][m${position}]`,
      );
    });

    const legs = keptIsolated.map((_entry, position) => `[m${position}]`).join('');
    const master_level = volumeFilter(master.volume);
    const tail = master_level ? `,${master_level}` : '';

    if (keptIsolated.length > 1) {
      // normalize=0 for the same reason the timeline export uses it: amix
      // otherwise divides by the input count, so adding a music track would
      // quietly duck everything else. OBS's own track 1 sums its sources, and
      // this is meant to be that same mix minus what was muted.
      filters.push(
        `${legs}amix=inputs=${keptIsolated.length}:duration=longest:dropout_transition=0:normalize=0${tail}[mix]`,
      );
    } else {
      filters.push(`${legs}${master_level ?? 'anull'}[mix]`);
    }

    args.push('-map', '[mix]');
    encode();
    output += 1;

    keptIsolated.forEach((_entry, position) => {
      args.push('-map', `[k${position}]`);
      encode();
      output += 1;
    });

    return {
      filterComplex: filters.join(';'),
      args,
      reencoded: true,
      outputs: output,
    };
  }

  /*
   * Nothing to rebuild: every surviving track is either untouched, and copied,
   * or has a level on it, and is encoded on its own.
   */
  const kept = resolved.filter((entry) => !entry.muted);

  kept.forEach((entry) => {
    const level = volumeFilter(entry.volume);
    if (level) {
      filters.push(`[0:a:${entry.track.index}]${level}[ga${output}]`);
      args.push('-map', `[ga${output}]`);
      encode();
    } else {
      args.push('-map', `0:a:${entry.track.index}`, `-c:a:${output}`, 'copy');
    }
    output += 1;
  });

  return {
    filterComplex: filters.length ? filters.join(';') : null,
    args,
    reencoded: filters.length > 0,
    outputs: output,
  };
}

export interface MixedAudioPlan {
  /**
   * The filter chain that produces the mix, without its output label.
   *
   * Null when the sound is one stream taken as recorded, which is what an
   * export does unless somebody has touched a track.
   */
  filterComplex: string | null;
  /** What to map: a filter label, or a stream. */
  map: string;
  /** Whether anything was changed, so a caller can skip a filter it can copy. */
  changed: boolean;
}

/**
 * One stream out of many, for an export.
 *
 * An export writes a movie, and a movie has one soundtrack: the timeline mixes
 * in music, crossfades between clips and normalises loudness, none of which is
 * expressible across six parallel tracks. So the selection is applied and the
 * result is flattened, rather than being carried.
 *
 * `trackVolume` is the clip's own fader on the timeline, which multiplies
 * whatever the per-track levels did. Applied last, and folded into the same
 * chain rather than added as a second `-af`, because the two would otherwise
 * fight over one output label.
 */
export function planMixedAudio(
  tracks: ClipAudioTrack[],
  selections: ClipAudioSelection[] = [],
  trackVolume = 1,
  input = 0,
): MixedAudioPlan {
  const clipLevel = trackVolume === 1 ? null : `volume=${trackVolume.toFixed(3)}`;
  const resolved = resolve(tracks, selections);
  const touched = resolved.some((entry) => entry.changed);

  if (tracks.length === 0 || !touched) {
    // `?` because a clip with no sound at all is a clip, and a hard map on one
    // fails the whole command rather than producing a silent segment.
    if (!clipLevel) return { filterComplex: null, map: `${input}:a:0?`, changed: false };
    return {
      filterComplex: `[${input}:a:0]${clipLevel}[mixa${input}]`,
      map: `[mixa${input}]`,
      changed: false,
    };
  }

  const isolated = resolved.filter((entry) => !entry.track.master);
  /*
   * The isolated tracks, not the master.
   *
   * Muting is subtraction, and the master is a sum: there is no filter that
   * takes voice chat back out of a mix that already has it. So as soon as
   * anything is muted or moved, the mix is rebuilt from the parts.
   */
  const pool = (isolated.length > 0 ? isolated : resolved).filter((entry) => !entry.muted);

  if (pool.length === 0) {
    /*
     * Everything muted, which is a thing somebody can ask for.
     *
     * A silent segment rather than a segment with no audio stream, because the
     * concat that joins them needs every segment to carry the same streams.
     * Silence by turning a real track all the way down rather than by
     * `anullsrc`, which has no length: an endless source in a graph is a
     * command that never finishes unless something else stops it, and the
     * segment that would have to stop it is the one being built.
     */
    return {
      filterComplex: `[${input}:a:${resolved[0].track.index}]volume=0[mixa${input}]`,
      map: `[mixa${input}]`,
      changed: true,
    };
  }

  const parts = pool.map((entry, position) => {
    const level = volumeFilter(entry.volume);
    return `[${input}:a:${entry.track.index}]${level ? `${level},` : ''}asetpts=PTS-STARTPTS[p${input}_${position}]`;
  });

  const legs = pool.map((_entry, position) => `[p${input}_${position}]`).join('');
  const tail = clipLevel ? `,${clipLevel}` : '';

  const chain =
    pool.length > 1
      ? `${legs}amix=inputs=${pool.length}:duration=longest:dropout_transition=0:normalize=0${tail}[mixa${input}]`
      : `${legs}${clipLevel ?? 'anull'}[mixa${input}]`;

  return {
    filterComplex: [...parts, chain].join(';'),
    map: `[mixa${input}]`,
    changed: true,
  };
}
