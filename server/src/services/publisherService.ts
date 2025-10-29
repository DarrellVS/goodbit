import path from 'node:path';
import { RemotePublishAction } from '../actions/RemotePublishAction.js';
import { RemoteUnpublishAction } from '../actions/RemoteUnpublishAction.js';
import { RemoteListPublishedAction } from '../actions/RemoteListPublishedAction.js';

class PublisherService {
  async publish(filePath: string, displayName?: string, game?: string): Promise<{ filename: string; url: string; }>
  {
    const action = new RemotePublishAction();
    return await action.execute({ filePath, displayName, game });
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
}

export const publisherService = new PublisherService();


