import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface GetCollectionsOutput {
  collections: Array<Collection & { clipCount: number }>;
}

/**
 * Every collection, fullest first.
 *
 * The order is the server's, not each screen's, because three surfaces list
 * these and they should agree: the row above the clips, the batch dialog and
 * the command palette. The row only draws four before hiding the rest behind
 * *Show all*, so which four is a decision rather than a detail, and insertion
 * order put the oldest there whatever was in it.
 *
 * **Not "last used", which this table cannot answer.** `updatedAt` looks like
 * it would: it is an `@UpdateDateColumn` and both add and remove call
 * `save()`. It does not move, because TypeORM writes the junction rows and
 * skips the entity UPDATE when no column of it changed. Measured on a real
 * library: a collection of 8 clips and one of 12 both had `updatedAt` equal to
 * `createdAt`, and the only row where the two differed had been renamed.
 * Making it true means touching the collection row on every add, which is a
 * write and a reshuffling row order, so it is a decision rather than a fix.
 *
 * Ties break on the name, so the order is stable across reloads rather than
 * whatever the query planner felt like.
 */
export class GetCollectionsAction extends BaseAction<void, GetCollectionsOutput> {
  async execute(): Promise<GetCollectionsOutput> {
    const repo = AppDataSource.getRepository(Collection);
    const collections = await repo.find({ relations: { clips: true } });

    return {
      collections: collections
        .map((c) => ({ ...c, clipCount: c.clips?.length || 0 }))
        .sort((a, b) => b.clipCount - a.clipCount || a.name.localeCompare(b.name)),
    };
  }
}

