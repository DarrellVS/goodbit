import path from 'node:path';
import { RemotePublishAction } from '../actions/RemotePublishAction.js';
import { RemoteUnpublishAction } from '../actions/RemoteUnpublishAction.js';
import { RemoteListPublishedAction } from '../actions/RemoteListPublishedAction.js';
import { RemoteUpdateMetadataAction } from '../actions/RemoteUpdateMetadataAction.js';

class PublisherService {
  async publish(
    filePath: string,
    displayName?: string,
    game?: string,
    onProgress?: (fraction: number) => void,
  ): Promise<{ filename: string; url: string; }>
  {
    const action = new RemotePublishAction();
    return await action.execute({ filePath, displayName, game, onProgress });
  }

  async unpublish(filename: string): Promise<{ removed: boolean; }>
  {
    const action = new RemoteUnpublishAction();
    return await action.execute({ filename });
  }

  async listPublished(): Promise<string[]> {
    const action = new RemoteListPublishedAction();
    const { files } = await action.execute();
    return files;
  }

  async updateMetadata(filename: string, displayName: string, game: string): Promise<{ success: boolean; }>
  {
    const action = new RemoteUpdateMetadataAction();
    return await action.execute({ filename, displayName, game });
  }
}

export const publisherService = new PublisherService();


