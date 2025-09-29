import path from 'node:path';
import fs from 'node:fs/promises';
import { PublishClipAction } from '../actions/PublishClipAction.js';
import { UnpublishClipAction } from '../actions/UnpublishClipAction.js';

class ClipsService {
  async publish(filePath: string, originalName: string, displayName?: string): Promise<{ filename: string; url: string; }>
  {
    const action = new PublishClipAction();
    return await action.execute({ filePath, originalName, displayName });
  }

  async unpublish(filePath: string): Promise<{ removed: boolean; }>
  {
    const action = new UnpublishClipAction();
    return await action.execute({ filePath });
  }
}

export const clipsService = new ClipsService();


