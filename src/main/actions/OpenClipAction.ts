import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { spawn } from 'node:child_process';

export class OpenClipAction extends BaseAction<{ clipId: number }, void> {
  async execute({ clipId }: { clipId: number }): Promise<void> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });
    const normalized = clip.filePath.replace(/\//g, '\\');
    const arg = `/select,"${normalized}"`;
    const child = spawn('cmd', ['/c', 'start', '', 'explorer.exe', arg], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    });
    child.unref();
  }
}


