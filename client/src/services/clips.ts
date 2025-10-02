import axios from '../axios';
import type { TimelineClip } from '../types/editor';
import type { Clip } from '../types/clip';

export type ClipMeta = {
  durationSec: number;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: string | null;
};

interface ExportTimelineRequest {
  clips: Array<{
    clipId: number;
    startTime: number;
    trimStart: number;
    trimEnd: number;
    volume: number;
    muted: boolean;
  }>;
  outputName?: string;
  exportId?: string;
}

export async function exportTimeline(clips: readonly TimelineClip[], outputName?: string, exportId?: string): Promise<{ id: number }> {
  const payload: ExportTimelineRequest = {
    clips: clips.map(clip => ({
      clipId: clip.clipId,
      startTime: clip.startTime,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      volume: clip.volume,
      muted: clip.muted,
    })),
    outputName,
    exportId,
  };

  const response = await axios.post('/api/clips/export', payload);
  return response.data;
}

export async function getExportProgress(exportId: string): Promise<number | null> {
  const response = await axios.get(`/api/clips/export/${exportId}/progress`);
  return response.data.progress;
}

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

// Batch operations
export interface BatchOperationResult {
  success: number;
  failed: number;
  errors?: string[];
}

export async function batchStar(clipIds: number[], starred: boolean): Promise<BatchOperationResult> {
  const { data } = await axios.post<BatchOperationResult>('/api/clips/batch/star', { clipIds, starred });
  return data;
}

export async function batchPublish(clipIds: number[], publish: boolean): Promise<BatchOperationResult> {
  const { data } = await axios.post<BatchOperationResult>('/api/clips/batch/publish', { clipIds, publish });
  return data;
}

export async function batchAddTags(clipIds: number[], tags: string[]): Promise<BatchOperationResult> {
  const { data } = await axios.post<BatchOperationResult>('/api/clips/batch/add-tags', { clipIds, tags });
  return data;
}

export async function batchDelete(clipIds: number[]): Promise<BatchOperationResult> {
  const { data } = await axios.post<BatchOperationResult>('/api/clips/batch/delete', { clipIds });
  return data;
}

