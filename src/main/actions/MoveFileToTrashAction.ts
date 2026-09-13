import { shell } from 'electron';
import { normalize } from 'node:path';
import { BaseAction } from './BaseAction.js';

/**
 * Delete a file to the Recycle Bin, never unlink it.
 *
 * The path is normalised first. Clip paths are stored as `fast-glob` returns
 * them — with forward slashes, even on Windows — and while everything else
 * accepts those, the Windows shell does not: `shell.trashItem` rejected them
 * with "Failed to parse path", so deleting a clip failed outright. The `trash`
 * package this replaced was more forgiving.
 */
export class MoveFileToTrashAction extends BaseAction<{ filePath: string }, void> {
  async execute({ filePath }: { filePath: string }): Promise<void> {
    await shell.trashItem(normalize(filePath));
  }
}
