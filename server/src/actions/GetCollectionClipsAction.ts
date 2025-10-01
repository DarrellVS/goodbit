import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';
import { Clip } from '../entity/Clip.js';

export interface GetCollectionClipsInput {
  collectionId: number;
}

export interface GetCollectionClipsOutput {
  collection: Collection;
  clips: Clip[];
}

export class GetCollectionClipsAction extends BaseAction<GetCollectionClipsInput, GetCollectionClipsOutput> {
  async execute(input: GetCollectionClipsInput): Promise<GetCollectionClipsOutput> {
    const repo = AppDataSource.getRepository(Collection);
    
    const collection = await repo.findOneOrFail({
      where: { id: input.collectionId },
      relations: ['clips', 'clips.tags'],
    });
    
    return {
      collection,
      clips: collection.clips.map(clip => ({
        ...clip,
        tags: clip.tags?.map(t => t.name) || [],
      })) as any,
    };
  }
}

