import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';
import { Clip } from '../entity/Clip.js';

export interface GetCollectionClipsInput {
  collectionId: number;
  page?: number;
  pageSize?: number;
  game?: string;
  q?: string;
  tags?: string;
  published?: string;
  starred?: string;
  /** One of `CLIP_SORTS`' values. Anything else falls back to newest first. */
  sort?: string;
}

export interface GetCollectionClipsOutput {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
}

const SORTS: Record<string, [string, 'ASC' | 'DESC']> = {
  newest: ['clip.recordedAt', 'DESC'],
  oldest: ['clip.recordedAt', 'ASC'],
  longest: ['clip.durationSec', 'DESC'],
  shortest: ['clip.durationSec', 'ASC'],
  largest: ['clip.sizeBytes', 'DESC'],
  smallest: ['clip.sizeBytes', 'ASC'],
  name: ['clip.filename', 'ASC'],
};

export class GetCollectionClipsAction extends BaseAction<GetCollectionClipsInput, GetCollectionClipsOutput> {
  async execute(input: GetCollectionClipsInput): Promise<GetCollectionClipsOutput> {
    const collectionRepo = AppDataSource.getRepository(Collection);
    const clipRepo = AppDataSource.getRepository(Clip);
    
    const collection = await collectionRepo.findOneOrFail({
      where: { id: input.collectionId },
      relations: { clips: true },
    });

    const clipIds = collection.clips.map(c => c.id);
    
    if (clipIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: input.page || 1,
        pageSize: input.pageSize || 50,
      };
    }

    const pageNum = Math.max(input.page || 1, 1);
    const pageSz = Math.min(Math.max(input.pageSize || 50, 1), 200);

    /*
     * A collection takes the library's orders.
     *
     * This was hard-coded to newest first, so the sort control on a collection
     * reordered nothing and had to be hidden there. A collection is a view of
     * the library, the same kind of thing as Starred, and the two screens
     * disagreeing about what "longest" means would be worse than either.
     *
     * The same table as `GET /clips`, deliberately duplicated rather than
     * imported: it is four lines, and a shared constant between a route and an
     * action is the kind of coupling 3.7 is meant to remove rather than add to.
     * `addOrderBy('clip.id')` is the tie-break, because a collection of clips
     * recorded in one session shares a timestamp and an unstable order makes
     * paging repeat a row.
     */
    const [sortColumn, sortDirection] = SORTS[String(input.sort)] ?? SORTS.newest;

    let qb = clipRepo
      .createQueryBuilder('clip')
      .leftJoinAndSelect('clip.tags', 'tag')
      .where('clip.id IN (:...clipIds)', { clipIds })
      .orderBy(sortColumn, sortDirection)
      .addOrderBy('clip.id', 'DESC');

    if (input.game && input.game.length > 0) {
      qb = qb.andWhere('clip.game = :game', { game: input.game });
    }

    if (input.published === 'true') {
      qb = qb.andWhere('clip.published = :published', { published: true });
    }
    if (input.published === 'false') {
      qb = qb.andWhere('clip.published = :published', { published: false });
    }

    if (input.starred === 'true') {
      qb = qb.andWhere('clip.starred = :starred', { starred: true });
    }

    if (input.q && input.q.length > 0) {
      qb = qb.andWhere('(' +
        'clip.filename LIKE :q OR ' +
        'clip.displayName LIKE :q OR ' +
        'tag.name LIKE :q' +
      ')', { q: `%${input.q}%` });
    }

    if (input.tags && input.tags.length > 0) {
      const tagList = input.tags.split(',').map((s) => s.trim()).filter(Boolean);
      if (tagList.length > 0) {
        qb = qb.andWhere('tag.name IN (:...names)', { names: tagList })
               .groupBy('clip.id')
               .having('COUNT(DISTINCT tag.name) >= :required', { required: tagList.length });
      }
    }

    const [items, total] = await qb
      .skip((pageNum - 1) * pageSz)
      .take(pageSz)
      .getManyAndCount();

    const normalized = items.map((c) => ({
      ...c,
      tags: (c.tags || []).map((t) => t.name),
    }));

    return {
      items: normalized as any,
      total,
      page: pageNum,
      pageSize: pageSz,
    };
  }
}

