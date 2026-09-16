import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { GoodBit } from '../entity/GoodBit.js';
import { requireRange } from '../services/goodBits.js';

export interface UpdateGoodBitInput {
  clipId: number;
  goodBitId: number;
  /** Absent leaves it alone; null and an empty string both clear it. */
  name?: string | null;
  startSec?: number;
  endSec?: number;
}

export interface UpdateGoodBitOutput {
  goodBit: GoodBit;
}

/**
 * Rename a GoodBit, or move its edges.
 *
 * `clipId` as well as the id, because every route that reaches this is nested
 * under a clip: a pair that does not match is a mistake worth answering with a
 * 404 rather than quietly editing a row on another recording.
 *
 * **`source`, `reason` and `confidence` cannot be edited here.** They are the
 * detector's record of what it saw and how sure it was, and a person nudging a
 * handle is almost always adjusting the padding rather than disagreeing that a
 * kill happened; the sentence stays true about what is inside the range. The
 * alternative, blanking the reason on any edit, throws away the one thing the
 * expensive half of the analysis produced the moment somebody touches it.
 */
export class UpdateGoodBitAction extends BaseAction<UpdateGoodBitInput, UpdateGoodBitOutput> {
  async execute(input: UpdateGoodBitInput): Promise<UpdateGoodBitOutput> {
    const repo = AppDataSource.getRepository(GoodBit);
    const goodBit = await repo.findOneByOrFail({ id: input.goodBitId, clipId: input.clipId });
    const clip = await AppDataSource.getRepository(Clip).findOneByOrFail({ id: input.clipId });

    // Either edge may move on its own, so the range is checked as it will be
    // stored rather than as it arrived: dragging only the start of a two second
    // GoodBit past its end is the case a per-field check would miss.
    const range = requireRange({
      startSec: input.startSec ?? goodBit.startSec,
      endSec: input.endSec ?? goodBit.endSec,
      durationSec: clip.durationSec,
    });

    goodBit.startSec = range.startSec;
    goodBit.endSec = range.endSec;

    if (input.name !== undefined) {
      const name = input.name?.trim();
      goodBit.name = name && name.length > 0 ? name : null;
    }

    return { goodBit: await repo.save(goodBit) };
  }
}
