import { BaseAction } from './BaseAction.js';
import trash from 'trash';

export class MoveFileToTrashAction extends BaseAction<{ filePath: string }, void> {
  async execute({ filePath }: { filePath: string }): Promise<void> {
    await trash([filePath]);
  }
}


