import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../entity/Collection.js';

export interface DeleteCollectionInput {
  id: number;
}

export class DeleteCollectionAction extends BaseAction<DeleteCollectionInput, void> {
  async execute(input: DeleteCollectionInput): Promise<void> {
    const repo = AppDataSource.getRepository(Collection);
    await repo.delete(input.id);
  }
}

