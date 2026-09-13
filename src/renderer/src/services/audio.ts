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

export async function uploadAudioTracks(
  files: File[],
  onProgress?: (percent: number) => void
): Promise<UploadAudioResult> {
  const form = new FormData();
  for (const file of files) form.append('files', file);

  const { data } = await axios.post<UploadAudioResult>('/api/audio/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });

  return data;
}

export async function deleteAudioTrack(id: string): Promise<void> {
  await axios.delete(`/api/audio/${encodeURIComponent(id)}`);
}
