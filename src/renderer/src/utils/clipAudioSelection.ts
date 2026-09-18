import type { ClipAudioSelection, ClipAudioTrack } from '@shared/index';

/**
 * Reading and changing a per-track audio selection.
 *
 * A list of decisions rather than a value per track, because most clips have
 * nothing decided about them and an absent selection is what keeps a trim a
 * stream copy. That makes every read a search and every write a merge, which
 * is exactly the kind of thing that ends up written twice: the trimmer holds
 * its selection in a composable and the editor holds it on the timeline clip,
 * and the two would otherwise each grow their own version of "toggle a mute".
 *
 * Pure, so `tests/unit` owns it.
 */

export function isMutedIn(selection: readonly ClipAudioSelection[] | undefined, index: number): boolean {
  return selection?.some((entry) => entry.index === index && entry.muted === true) === true;
}

/** A multiplier, where 1 is the recorded level. The interface shows a percentage. */
export function volumeIn(selection: readonly ClipAudioSelection[] | undefined, index: number): number {
  const entry = selection?.find((candidate) => candidate.index === index);
  return Number.isFinite(entry?.volume) ? (entry?.volume as number) : 1;
}

/**
 * Put one track's decision back, and drop it when there is nothing left to say.
 *
 * An entry that mutes nothing and moves nothing is not a decision, and leaving
 * it in the list would make an untouched clip look touched: the trim would
 * rebuild its mix rather than copying it, for no change in what anybody hears.
 */
function merged(
  selection: readonly ClipAudioSelection[] | undefined,
  index: number,
  change: { muted: boolean; volume: number },
): ClipAudioSelection[] {
  const rest = (selection ?? []).filter((entry) => entry.index !== index);
  if (!change.muted && change.volume === 1) return rest;

  return [
    ...rest,
    {
      index,
      ...(change.muted ? { muted: true } : {}),
      ...(change.volume === 1 ? {} : { volume: change.volume }),
    },
  ].sort((a, b) => a.index - b.index);
}

export function withMuteToggled(
  selection: readonly ClipAudioSelection[] | undefined,
  index: number,
): ClipAudioSelection[] {
  return merged(selection, index, {
    muted: !isMutedIn(selection, index),
    volume: volumeIn(selection, index),
  });
}

export function withVolume(
  selection: readonly ClipAudioSelection[] | undefined,
  index: number,
  volume: number,
): ClipAudioSelection[] {
  return merged(selection, index, { muted: isMutedIn(selection, index), volume });
}

/**
 * Keep one track and leave the rest out.
 *
 * The master is not in the reckoning: it is every other track summed, so
 * soloing the game against it would be soloing the game against the game.
 * Pressing it again on a track that is already the only survivor puts
 * everything back, which is the only sensible second press.
 *
 * Levels are dropped along with the mutes, because "only this" is a statement
 * about the whole clip rather than about one row, and leaving a forgotten 40%
 * on a track that comes back is a surprise nobody can trace.
 */
export function soloed(
  selection: readonly ClipAudioSelection[] | undefined,
  tracks: readonly ClipAudioTrack[],
  index: number,
): ClipAudioSelection[] {
  const others = tracks.filter((track) => track.index !== index && !track.master);
  const already =
    !isMutedIn(selection, index) && others.every((track) => isMutedIn(selection, track.index));

  if (already) return [];
  return others.map((track) => ({ index: track.index, muted: true }));
}

/** Whether anything at all was decided, which is what makes a reset worth offering. */
export function hasSelection(selection: readonly ClipAudioSelection[] | undefined): boolean {
  return (selection?.length ?? 0) > 0;
}
