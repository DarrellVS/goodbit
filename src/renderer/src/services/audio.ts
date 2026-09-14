import axios from '../axios';
import type { AudioTrack } from '../types/audio';

export interface UploadAudioResult {
  imported: number;
  failed: number;
  tracks: AudioTrack[];
  errors?: string[];
}

export async function listAudioTracks(): Promise<AudioTrack[]> {
  const { data } = await axios.get<{ items: AudioTrack[] }>('/api/audio');
  return data.items;
}

/**
 * Import music by path.
 *
 * This posted multipart form data, which cannot cross the contextBridge, the
 * request arrived with no body and the server answered "No files provided". A
 * desktop app has no reason to stream bytes through the renderer anyway: the
 * files are on this disk, so main is told where and reads them itself.
 *
 * There is no progress to report now, since nothing is being transferred.
 */
export async function importAudioTracks(paths: string[]): Promise<UploadAudioResult> {
  const bridge = window.goodbit;
  if (!bridge) throw new Error('The GoodBit bridge is unavailable');
  return (await bridge.importAudio(paths)) as UploadAudioResult;
}

/** Open the OS picker for music files. Returns an empty list if cancelled. */
export async function pickAudioFiles(): Promise<string[]> {
  return (await window.goodbit?.pickFiles('audio')) ?? [];
}

/**
 * The path of a dropped or selected File.
 *
 * Electron 32 removed `File.path`; `webUtils.getPathForFile` is the supported
 * replacement and lives behind the bridge.
 */
export function pathForFile(file: File): string {
  return window.goodbit?.pathForFile(file) ?? '';
}

export async function deleteAudioTrack(id: string): Promise<void> {
  await axios.delete(`/api/audio/${encodeURIComponent(id)}`);
}
