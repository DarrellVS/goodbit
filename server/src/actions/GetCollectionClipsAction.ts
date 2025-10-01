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
}

export interface GetCollectionClipsOutput {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
}

export class GetCollectionClipsAction extends BaseAction<GetCollectionClipsInput, GetCollectionClipsOutput> {
  async execute(input: GetCollectionClipsInput): Promise<GetCollectionClipsOutput> {
    const collectionRepo = AppDataSource.getRepository(Collection);
    const clipRepo = AppDataSource.getRepository(Clip);
    
    const collection = await collectionRepo.findOneOrFail({
      where: { id: input.collectionId },
      relations: ['clips'],
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

    let qb = clipRepo
      .createQueryBuilder('clip')
      .leftJoinAndSelect('clip.tags', 'tag')
      .where('clip.id IN (:...clipIds)', { clipIds })
      .orderBy('clip.fileModifiedAt', 'DESC');

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

