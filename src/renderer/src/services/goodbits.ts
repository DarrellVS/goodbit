import axios from '@renderer/axios';
import type { GoodBit, NewGoodBit } from '@renderer/types/goodbit';
import type { TrimMode } from './clips';

/**
 * A clip's GoodBits, one function per endpoint.
 *
 * Nested under the clip everywhere, because a GoodBit is not a thing on its
 * own: it is a start and an end inside one recording and it dies with that
 * recording, so "which clip" is never a question the caller has to be asked.
 */

/** In clip order, which is the order they are read against a timeline. */
export async function listGoodBits(clipId: number): Promise<GoodBit[]> {
  const { data } = await axios.get<{ items: GoodBit[] }>(`/api/clips/${clipId}/goodbits`);
  return data.items;
}

export async function createGoodBit(clipId: number, goodBit: NewGoodBit): Promise<GoodBit> {
  const { data } = await axios.post<GoodBit>(`/api/clips/${clipId}/goodbits`, goodBit);
  return data;
}

/**
 * Change a name, an edge, or both. Anything left out stays where it is.
 *
 * `undefined` has to survive the trip rather than being sent as null: the route
 * reads an absent edge as "leave it", and a null one would arrive as NaN.
 */
export async function updateGoodBit(
  clipId: number,
  goodBitId: number,
  patch: { name?: string | null; startSec?: number; endSec?: number },
): Promise<GoodBit> {
  const { data } = await axios.patch<GoodBit>(
    `/api/clips/${clipId}/goodbits/${goodBitId}`,
    patch,
  );
  return data;
}

/** Removes the mark. The recording is not touched, which is the whole point. */
export async function deleteGoodBit(clipId: number, goodBitId: number): Promise<void> {
  await axios.delete(`/api/clips/${clipId}/goodbits/${goodBitId}`);
}

/**
 * Write a GoodBit out as a clip of its own.
 *
 * Answered with a job id rather than a file: the cut re-encodes to land on the
 * frames asked for, which on a 3440 wide recording is tens of seconds. Poll it
 * with `pollJob` from `./jobs`.
 */
export async function renderGoodBit(
  clipId: number,
  goodBitId: number,
  mode?: TrimMode,
): Promise<{ jobId: string }> {
  const { data } = await axios.post<{ jobId: string }>(
    `/api/clips/${clipId}/goodbits/${goodBitId}/render`,
    mode ? { mode } : {},
  );
  return data;
}
