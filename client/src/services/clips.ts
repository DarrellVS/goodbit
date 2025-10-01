import axios from '../axios';
import type { Clip } from '../types/clip';

export type ClipMeta = {
  durationSec: number;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: string | null;
};

export async function updateClipName(id: number, displayName: string | null): Promise<Clip> {
  const { data } = await axios.patch<Clip>(`/api/clips/${id}`, { displayName });
  return data;
}

export async function updateClipTags(id: number, tags: string[]): Promise<Clip> {
  const { data } = await axios.patch<Clip>(`/api/clips/${id}`, { tags });
  return data;
}

export async function listAllTags(): Promise<string[]> {
  const { data } = await axios.get<{ items: string[] }>(`/api/tags`);
  return data.items;
}

export async function deleteClip(id: number): Promise<void> {
  await axios.delete(`/api/clips/${id}`);
}

export async function openClip(id: number): Promise<void> {
  await axios.post(`/api/clips/${id}/open`);
}

export async function getClipMeta(id: number): Promise<ClipMeta> {
  const { data } = await axios.get<ClipMeta>(`/api/clips/${id}/meta`);
  return data;
}

export async function trimClip(id: number, startSec: number, endSec: number): Promise<void> {
  await axios.post(`/api/clips/${id}/trim`, { startSec, endSec });
}

export async function publishClip(id: number): Promise<Clip> {
  const { data } = await axios.post<Clip>(`/api/clips/${id}/publish`);
  return data;
}

export async function unpublishClip(id: number): Promise<Clip> {
  const { data } = await axios.post<Clip>(`/api/clips/${id}/unpublish`);
  return data;
}

export async function deleteTag(tagName: string): Promise<void> {
  await axios.delete(`/api/tags/${encodeURIComponent(tagName)}`);
}

export async function starClip(id: number): Promise<Clip> {
  const { data } = await axios.post<Clip>(`/api/clips/${id}/star`);
  return data;
}

export async function unstarClip(id: number): Promise<Clip> {
  const { data } = await axios.post<Clip>(`/api/clips/${id}/unstar`);
  return data;
}

export interface AudioHighlight {
  timestamp: number;
  peak: number;
}

export async function getClipHighlights(id: number): Promise<AudioHighlight[]> {
  const { data } = await axios.get<AudioHighlight[]>(`/api/clips/${id}/highlights`);
  return data;
}


