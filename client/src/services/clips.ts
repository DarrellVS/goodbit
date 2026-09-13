import axios from '../axios';
import type { TimelineAudio, TimelineClip } from '../types/editor';
import type { Clip } from '../types/clip';
import type { Tag } from '../types/tag';

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
  audio: Array<{
    trackId: string;
    startTime: number;
    trimStart: number;
    trimEnd: number;
    volume: number;
    muted: boolean;
    fadeIn: number;
    fadeOut: number;
  }>;
  outputName?: string;
}

export interface ListClipsParams {
  page?: number;
  pageSize?: number;
  game?: string;
  q?: string;
  tags?: string[];
}

export interface ListClipsResult {
  items: Clip[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listClips(params: ListClipsParams = {}, signal?: AbortSignal): Promise<ListClipsResult> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 50,
  };

  if (params.game) query.game = params.game;
  if (params.q) query.q = params.q;
  if (params.tags?.length) query.tags = params.tags.join(',');

  const { data } = await axios.get<ListClipsResult>('/api/clips', { params: query, signal });
  return data;
}

export type ExportJobStatus = 'running' | 'done' | 'error';

export interface ExportStatus {
  status: ExportJobStatus;
  progress: number;
  clip: Clip | null;
  error: string | null;
}

/** Kicks the render off; the server answers with an id, not a file. */
export async function startExport(
  clips: readonly TimelineClip[],
  audio: readonly TimelineAudio[] = [],
  outputName?: string
): Promise<{ exportId: string }> {
  const payload: ExportTimelineRequest = {
    clips: clips.map(clip => ({
      clipId: clip.clipId,
      startTime: clip.startTime,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      volume: clip.volume,
      muted: clip.muted,
    })),
    audio: audio.map(item => ({
      trackId: item.trackId,
      startTime: item.startTime,
      trimStart: item.trimStart,
      trimEnd: item.trimEnd,
      volume: item.volume,
      muted: item.muted,
      fadeIn: item.fadeIn,
      fadeOut: item.fadeOut,
    })),
    outputName,
  };

  const { data } = await axios.post<{ exportId: string }>('/api/clips/export', payload);
  return data;
}

export async function getExportStatus(exportId: string): Promise<ExportStatus> {
  const { data } = await axios.get<ExportStatus>(`/api/clips/export/${exportId}/status`);
  return data;
}

export async function updateClipName(id: number, displayName: string | null): Promise<Clip> {
  const { data } = await axios.patch<Clip>(`/api/clips/${id}`, { displayName });
  return data;
}

export async function updateClipTags(id: number, tags: string[]): Promise<Clip> {
  const { data } = await axios.patch<Clip>(`/api/clips/${id}`, { tags });
  return data;
}

export async function updateClipNotes(id: number, notes: string | null): Promise<Clip> {
  const { data } = await axios.patch<Clip>(`/api/clips/${id}`, { notes });
  return data;
}

export async function listAllTags(): Promise<Tag[]> {
  const { data } = await axios.get<{ items: Tag[] }>(`/api/tags`);
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

export interface ImportFilesResult {
  imported: number;
  failed: number;
  clips: Clip[];
  errors?: string[];
}

export async function importFiles(files: File[]): Promise<ImportFilesResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  
  const { data } = await axios.post<ImportFilesResult>('/api/clips/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return data;
}

export async function moveClipToGame(id: number, targetGame: string): Promise<Clip> {
  const { data } = await axios.post<Clip>(`/api/clips/${id}/move-to-game`, { targetGame });
  return data;
}

export async function getClip(id: number): Promise<Clip> {
  const { data } = await axios.get<Clip>(`/api/clips/${id}`);
  return data;
}

export interface ExportAudioResult {
  audioPath: string;
  filename: string;
}

export async function exportAudio(id: number): Promise<ExportAudioResult> {
  const { data } = await axios.post<ExportAudioResult>(`/api/clips/${id}/export-audio`);
  return data;
}

export async function getClipCollections(id: number): Promise<number[]> {
  const { data } = await axios.get<{ collectionIds: number[] }>(`/api/clips/${id}/collections`);
  return data.collectionIds;
}

export async function revealFileInExplorer(filePath: string): Promise<void> {
  await axios.post('/api/clips/reveal-file', { filePath });
}

