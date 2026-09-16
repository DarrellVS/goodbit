import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { GoodBit } from '../entity/GoodBit.js';

export interface ListGoodBitsInput {
  clipId: number;
}

export interface ListGoodBitsOutput {
  goodBits: GoodBit[];
}

/**
 * The GoodBits on one clip, in the order they happen.
 *
 * In clip order rather than newest first, because this list is read against a
 * timeline: the pips on a frame strip and the chips under a player are the same
 * list, and both are laid out left to right. `IDX_good_bit_clip` is
 * `(clipId, startSec)` for exactly this read.
 */
export class ListGoodBitsAction extends BaseAction<ListGoodBitsInput, ListGoodBitsOutput> {
  async execute({ clipId }: ListGoodBitsInput): Promise<ListGoodBitsOutput> {
    const goodBits = await AppDataSource.getRepository(GoodBit).find({
      where: { clipId },
      order: { startSec: 'ASC', id: 'ASC' },
    });

    return { goodBits };
  }
}
