import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { GoodBit, type GoodBitSource } from '../entity/GoodBit.js';
import { requireRange } from '../services/goodBits.js';

export interface CreateGoodBitInput {
  clipId: number;
  startSec: number;
  endSec: number;
  /** What to call it. Optional, and usually absent at the moment of marking. */
  name?: string | null;
  /** Defaults to `manual`, which after the measurement is the common case. */
  source?: GoodBitSource;
  /** A detector's sentence. Ignored for a manual GoodBit. */
  reason?: string | null;
  /** A detector's 0 to 1. Ignored for a manual GoodBit. */
  confidence?: number | null;
}

export interface CreateGoodBitOutput {
  goodBit: GoodBit;
}

/**
 * Mark a range of a clip as worth watching, without touching the clip.
 *
 * **This is the primary path, and marking by hand is the primary case.** The
 * measurement behind 2.1 came back at 4% of clips holding two or more detected
 * moments, against the 15% that would have made detection the story, so the
 * shape of this action follows from that: a start, an end, and nothing else
 * required. A person watching a clip knows it has two good bits whether or not
 * a kill banner appeared.
 *
 * Detection is filler on top. A caller with a suggestion in hand, the ranked
 * `anchors` on `ClipSuggestionsDTO`, passes `source: 'hud'` with the sentence
 * and the confidence that came with it, and the row then records that the
 * screen put it there rather than a person. Nothing writes these rows on its
 * own: a GET that stores things is a surprise, and the analysis is recomputed
 * from cache on every call, so there is nothing to lose by waiting to be asked.
 *
 * Overlapping GoodBits are allowed. A ten second stretch with the punchline
 * marked inside it is two ranges somebody meant, and refusing it would need a
 * tolerance nobody has measured.
 */
export class CreateGoodBitAction extends BaseAction<CreateGoodBitInput, CreateGoodBitOutput> {
  async execute(input: CreateGoodBitInput): Promise<CreateGoodBitOutput> {
    const clip = await AppDataSource.getRepository(Clip).findOneByOrFail({ id: input.clipId });
    const repo = AppDataSource.getRepository(GoodBit);

    // Checked here rather than left to the table's `CHECK (endSec > startSec)`.
    // A constraint violation arrives as `SQLITE_CONSTRAINT: CHECK constraint
    // failed: CHK_good_bit_range`, which is the right thing for a last line of
    // defence and the wrong thing to show somebody who dragged a handle.
    const range = requireRange({
      startSec: input.startSec,
      endSec: input.endSec,
      durationSec: clip.durationSec,
    });

    const source = input.source ?? 'manual';
    const name = input.name?.trim();
    // Held to 0..1, because it is shown as how sure the app is: a caller that
    // sends 94 rather than 0.94 would have it read as certainty itself, and an
    // unchecked body can carry anything, including something that is not a
    // number at all.
    const confidence = Number(input.confidence);
    const sure = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null;

    const goodBit = repo.create({
      clipId: clip.id,
      startSec: range.startSec,
      endSec: range.endSec,
      name: name && name.length > 0 ? name : null,
      source,
      /*
       * A person marking their own clip owes nobody an explanation.
       *
       * `reason` and `confidence` are a detector's record of why it spoke up,
       * and `source` is what tells the UI whether to look for them. Letting a
       * manual GoodBit carry either would make `source` unreliable as the thing
       * to check, which is the only reason it exists.
       */
      reason: source === 'manual' ? null : (input.reason?.trim() || null),
      confidence: source === 'manual' ? null : sure,
    });

    return { goodBit: await repo.save(goodBit) };
  }
}
