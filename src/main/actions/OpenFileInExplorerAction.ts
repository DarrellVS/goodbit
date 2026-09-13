import { shell } from 'electron';
import { normalize } from 'node:path';
import { BaseAction } from './BaseAction.js';

export interface OpenFileInExplorerInput {
  filePath: string;
}

/**
 * Reveal any file in the file manager.
 *
 * See OpenClipAction: this was the same Windows-only shell-out.
 */
export class OpenFileInExplorerAction extends BaseAction<OpenFileInExplorerInput, void> {
  async execute({ filePath }: OpenFileInExplorerInput): Promise<void> {
    shell.showItemInFolder(normalize(filePath));
  }
}
