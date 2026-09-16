import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { GoodBit } from '../entity/GoodBit.js';

export interface DeleteGoodBitInput {
  clipId: number;
  goodBitId: number;
}

export interface DeleteGoodBitOutput {
  deleted: boolean;
}

/**
 * Forget a GoodBit. The clip, and anything rendered from it, stay.
 *
 * Not a destructive action in the sense the toast store means: no file moves
 * and nothing goes to the Recycle Bin, because a GoodBit is a pair of numbers
 * about a recording that is still whole. A render made earlier is a clip in its
 * own right by then and has no link back to say otherwise.
 *
 * `deleted: false` rather than a throw for a row that is not there. Pressing
 * delete twice, or on a GoodBit a rescan already took with its clip, is not an
 * error; it is the state the caller wanted.
 */
export class DeleteGoodBitAction extends BaseAction<DeleteGoodBitInput, DeleteGoodBitOutput> {
  async execute({ clipId, goodBitId }: DeleteGoodBitInput): Promise<DeleteGoodBitOutput> {
    const result = await AppDataSource.getRepository(GoodBit).delete({
      id: goodBitId,
      clipId,
    });

    return { deleted: (result.affected ?? 0) > 0 };
  }
}
