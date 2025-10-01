import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface CreateCollectionInput {
  name: string;
}

export interface CreateCollectionOutput {
  collection: Collection;
}

export class CreateCollectionAction extends BaseAction<CreateCollectionInput, CreateCollectionOutput> {
  async execute(input: CreateCollectionInput): Promise<CreateCollectionOutput> {
    const repo = AppDataSource.getRepository(Collection);
    const collection = repo.create({ name: input.name, clips: [] });
    await repo.save(collection);
    return { 
      collection: {
        ...collection,
        clipCount: 0,
      } as any,
    };
  }
}

