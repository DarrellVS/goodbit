import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface GetClipCollectionsInput {
  clipId: number;
}

export interface GetClipCollectionsOutput {
  collectionIds: number[];
}

export class GetClipCollectionsAction extends BaseAction<GetClipCollectionsInput, GetClipCollectionsOutput> {
  async execute(input: GetClipCollectionsInput): Promise<GetClipCollectionsOutput> {
    const repo = AppDataSource.getRepository(Collection);
    
    const collections = await repo
      .createQueryBuilder('collection')
      .innerJoin('collection.clips', 'clip', 'clip.id = :clipId', { clipId: input.clipId })
      .getMany();
    
    return {
      collectionIds: collections.map(c => c.id),
    };
  }
}

