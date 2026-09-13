import { shell } from 'electron';
import { BaseAction } from './BaseAction.js';

/**
 * Delete a file to the Recycle Bin, never unlink it.
 *
 * Was the `trash` package, which shells out to a Windows-only helper. Electron
 * does the same thing through the OS's own API, and works everywhere, so this
 * is one of the places the app stops being Windows-only for free.
 */
export class MoveFileToTrashAction extends BaseAction<{ filePath: string }, void> {
  async execute({ filePath }: { filePath: string }): Promise<void> {
    await shell.trashItem(filePath);
  }
}
