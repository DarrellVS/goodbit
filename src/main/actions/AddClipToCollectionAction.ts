import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';
import { Clip } from '../entity/Clip.js';

export interface AddClipToCollectionInput {
  collectionId: number;
  clipId: number;
}

export interface AddClipToCollectionOutput {
  collection: Collection;
}

export class AddClipToCollectionAction extends BaseAction<AddClipToCollectionInput, AddClipToCollectionOutput> {
  async execute(input: AddClipToCollectionInput): Promise<AddClipToCollectionOutput> {
    const collectionRepo = AppDataSource.getRepository(Collection);
    const clipRepo = AppDataSource.getRepository(Clip);
    
    const collection = await collectionRepo.findOneOrFail({
      where: { id: input.collectionId },
      relations: { clips: true },
    });
    
    const clip = await clipRepo.findOneByOrFail({ id: input.clipId });
    
    if (!collection.clips.some(c => c.id === clip.id)) {
      collection.clips.push(clip);
      await collectionRepo.save(collection);
    }
    
    return { 
      collection: {
        ...collection,
        clipCount: collection.clips?.length || 0,
      } as any,
    };
  }
}

