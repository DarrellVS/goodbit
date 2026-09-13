import { shell } from 'electron';
import { BaseAction } from './BaseAction.js';
import { resolveAudioPath } from '../services/audioLibrary.js';

export interface DeleteAudioTrackInput {
  id: string;
}

export class DeleteAudioTrackAction extends BaseAction<DeleteAudioTrackInput, { ok: true }> {
  async execute(input: DeleteAudioTrackInput): Promise<{ ok: true }> {
    const filePath = resolveAudioPath(input.id);
    if (!filePath) throw new Error(`Unknown audio track: ${input.id}`);

    // Recycle Bin, never unlink — same rule the clips follow.
    await shell.trashItem(filePath);
    return { ok: true };
  }
}
