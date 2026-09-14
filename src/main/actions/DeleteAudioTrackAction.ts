import { shell } from 'electron';
import { normalize } from 'node:path';
import { BaseAction } from './BaseAction.js';
import { resolveAudioPath } from '../services/audioLibrary.js';

export interface DeleteAudioTrackInput {
  id: string;
}

export class DeleteAudioTrackAction extends BaseAction<DeleteAudioTrackInput, { ok: true }> {
  async execute(input: DeleteAudioTrackInput): Promise<{ ok: true }> {
    const filePath = resolveAudioPath(input.id);
    if (!filePath) throw new Error(`Unknown audio track: ${input.id}`);

    // Recycle Bin, never unlink, same rule the clips follow.
    // Normalised: the Windows shell rejects the forward slashes these paths
    // carry, with "Failed to parse path".
    await shell.trashItem(normalize(filePath));
    return { ok: true };
  }
}
