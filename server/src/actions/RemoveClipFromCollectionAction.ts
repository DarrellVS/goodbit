import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface RemoveClipFromCollectionInput {
  collectionId: number;
  clipId: number;
}

export interface RemoveClipFromCollectionOutput {
  collection: Collection;
}

export class RemoveClipFromCollectionAction extends BaseAction<RemoveClipFromCollectionInput, RemoveClipFromCollectionOutput> {
  async execute(input: RemoveClipFromCollectionInput): Promise<RemoveClipFromCollectionOutput> {
    const repo = AppDataSource.getRepository(Collection);
    
    const collection = await repo.findOneOrFail({
      where: { id: input.collectionId },
      relations: ['clips'],
    });
    
    collection.clips = collection.clips.filter(c => c.id !== input.clipId);
    await repo.save(collection);
    
    return { 
      collection: {
        ...collection,
        clipCount: collection.clips?.length || 0,
      } as any,
    };
  }
}

