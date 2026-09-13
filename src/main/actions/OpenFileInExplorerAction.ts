import { BaseAction } from './BaseAction.js';
import { spawn } from 'node:child_process';

export interface OpenFileInExplorerInput {
  filePath: string;
}

export class OpenFileInExplorerAction extends BaseAction<OpenFileInExplorerInput, void> {
  async execute(input: OpenFileInExplorerInput): Promise<void> {
    const { filePath } = input;
    const normalized = filePath.replace(/\//g, '\\');
    const arg = `/select,"${normalized}"`;
    const child = spawn('cmd', ['/c', 'start', '', 'explorer.exe', arg], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.unref();
  }
}

