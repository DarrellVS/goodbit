import { shell } from 'electron';
import { normalize } from 'node:path';
import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';

/**
 * Reveal a clip in the file manager.
 *
 * Was `spawn('cmd', ['/c', 'start', '', 'explorer.exe', '/select,…'])` — a
 * Windows-only shell-out that also built a quoted argument by hand. Electron
 * does the same thing through the OS, and works everywhere.
 */
export class OpenClipAction extends BaseAction<{ clipId: number }, void> {
  async execute({ clipId }: { clipId: number }): Promise<void> {
    const repo = AppDataSource.getRepository(Clip);
    const clip = await repo.findOneByOrFail({ id: clipId });
    // Stored paths use forward slashes; the Windows shell will not take those.
    shell.showItemInFolder(normalize(clip.filePath));
  }
}
