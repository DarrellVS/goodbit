import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface GetCollectionsOutput {
  collections: Array<Collection & { clipCount: number }>;
}

export class GetCollectionsAction extends BaseAction<void, GetCollectionsOutput> {
  async execute(): Promise<GetCollectionsOutput> {
    const repo = AppDataSource.getRepository(Collection);
    const collections = await repo.find({ relations: ['clips'] });
    
    return {
      collections: collections.map(c => ({
        ...c,
        clipCount: c.clips?.length || 0,
      })),
    };
  }
}

