import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface UpdateCollectionInput {
  id: number;
  name: string;
}

export interface UpdateCollectionOutput {
  collection: Collection;
}

export class UpdateCollectionAction extends BaseAction<UpdateCollectionInput, UpdateCollectionOutput> {
  async execute(input: UpdateCollectionInput): Promise<UpdateCollectionOutput> {
    const repo = AppDataSource.getRepository(Collection);
    const collection = await repo.findOneOrFail({ 
      where: { id: input.id },
      relations: { clips: true },
    });
    collection.name = input.name;
    await repo.save(collection);
    return { 
      collection: {
        ...collection,
        clipCount: collection.clips?.length || 0,
      } as any,
    };
  }
}

