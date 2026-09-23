/**
 * Write every moment the analysis is sure of down as a GoodBit.
 *
 * The range rule is `@shared/detectedGoodBits.ts`; this is where the rows come
 * from. Called by the three readers somebody is waiting on or has asked for:
 * the trimmer's suggestions, the sweep when a game closes, and a pass at boot
 * over clips that were read before this existed. Not by a trim or an export,
 * which ask for suggestions only to work out where things are.
 *
 * - **Once per version of the file.** `clip.detectedMarkedFor` holds the
 *   `fileModifiedAt` the marks were written for, and a clip already written for
 *   is left alone, so a detected GoodBit somebody deleted stays deleted
 *   however often the trimmer is opened.
 * - **Never twice for one instant.** A moment already inside any GoodBit, one
 *   somebody made or one written earlier, is skipped.
 * - **The screen's moments when there are any, the sound's loudest instant
 *   when there are not.** That is the same thing `suggestedCount` counts, so a
 *   card saying "1 GoodBit found" opens onto one GoodBit.
 */
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { GoodBit } from '../entity/GoodBit.js';
import { CreateGoodBitAction } from '../actions/CreateGoodBitAction.js';
import { alreadyMarked, detectedRange, momentsOf } from '@shared/detectedGoodBits.js';
import type { SuggestionResult } from '../actions/EnsureClipSuggestionsAction.js';

/** Write the marks for one clip, if they are due. Returns how many were written. */
export async function markDetected(clipId: number, result: SuggestionResult): Promise<number> {
  const moments = momentsOf(result);
  if (!moments.length) return 0;

  const clips = AppDataSource.getRepository(Clip);
  const clip = await clips.findOneBy({ id: clipId });
  if (!clip) return 0;

  const version = new Date(clip.fileModifiedAt).getTime();
  if (clip.detectedMarkedFor && new Date(clip.detectedMarkedFor).getTime() === version) return 0;

  const existing = await AppDataSource.getRepository(GoodBit).find({ where: { clipId } });
  const taken = existing.map((goodBit) => ({ startSec: goodBit.startSec, endSec: goodBit.endSec }));
  const duration = clip.durationSec ?? result.durationSec ?? null;

  let written = 0;
  for (const moment of moments) {
    if (alreadyMarked(moment.atSec, taken)) continue;
    const range = detectedRange(moment, duration);
    if (!range) continue;
    try {
      await new CreateGoodBitAction().execute({
        clipId,
        startSec: range.startSec,
        endSec: range.endSec,
        name: moment.name,
        source: moment.source,
        reason: moment.reason,
        confidence: moment.confidence,
      });
      taken.push(range);
      written += 1;
    } catch (error) {
      console.warn(`[goodbits] could not mark clip ${clipId} at ${moment.atSec}s:`, (error as Error).message);
    }
  }

  await clips.update({ id: clipId }, { detectedMarkedFor: new Date(version) });
  return written;
}

/**
 * Mark the clips that were read before any of this existed.
 *
 * Only clips whose count says something was found and whose marks were never
 * written, so this reads caches that are already there rather than decoding
 * anything, and it goes one clip at a time, in the background, a while after
 * boot, because nobody is waiting on it.
 */
export async function markDetectedAcrossLibrary(signal?: AbortSignal): Promise<number> {
  if (!AppDataSource.isInitialized) return 0;
  const { EnsureClipSuggestionsAction } = await import('../actions/EnsureClipSuggestionsAction.js');
  const clips = await AppDataSource.getRepository(Clip)
    .createQueryBuilder('clip')
    .where('clip.suggestedCount > 0')
    .andWhere('clip.detectedMarkedFor IS NULL')
    .getMany();

  let written = 0;
  for (const clip of clips) {
    if (signal?.aborted) break;
    try {
      const result = await new EnsureClipSuggestionsAction().execute({ clipId: clip.id });
      written += await markDetected(clip.id, result);
    } catch (error) {
      console.warn(`[goodbits] could not read ${clip.filename}:`, (error as Error).message);
    }
  }
  if (clips.length) console.log(`[goodbits] marked ${written} found GoodBits across ${clips.length} clips`);
  return written;
}
