import axios from '../axios';
import type { TimelineAudio, TimelineClip } from '../types/editor';
import type { Clip } from '../types/clip';
import type { Tag } from '../types/tag';
import type { ExportFormat } from '@shared/index';

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
  format?: ExportFormat;
  framePos?: number;
  normalizeLoudness?: boolean;
}

/** The shape and sound choices an export is made with. */
export interface ExportOptions {
  format?: ExportFormat;
  framePos?: number;
  normalizeLoudness?: boolean;
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

export type ExportJobStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface ExportStatus {
  status: ExportJobStatus;
  progress: number;
  /** What the render is doing right now, in the words the UI uses. */
  message: string;
  /** Seconds left, or null until there is enough progress for it to mean anything. */
  etaSeconds: number | null;
  clip: Clip | null;
  error: string | null;
}

/** Kicks the render off; the server answers with an id, not a file. */
export async function startExport(
  clips: readonly TimelineClip[],
  audio: readonly TimelineAudio[] = [],
  outputName?: string,
  options: ExportOptions = {}
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
    format: options.format,
    framePos: options.framePos,
    normalizeLoudness: options.normalizeLoudness,
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

/** `compressed` re-encodes to share size; the default follows the setting. */
export type TrimMode = 'lossless' | 'exact' | 'compressed';

export interface TrimResult {
  ok: boolean;
  /** Where the cut actually landed; a lossless copy snaps back to a keyframe. */
  actualStartSec: number;
  actualEndSec: number;
  mode: TrimMode;
  /** The file's size after the trim. */
  sizeBytes: number;
}

/** Trim a clip in place. Leave `mode` out to let the compress-trims setting decide. */
export async function trimClip(
  id: number,
  startSec: number,
  endSec: number,
  mode?: TrimMode,
): Promise<TrimResult> {
  const { data } = await axios.post<TrimResult>(`/api/clips/${id}/trim`, {
    startSec,
    endSec,
    ...(mode ? { mode } : {}),
  });
  return data;
}

/** Where a lossless cut can begin, so the UI can show the snap before committing. */
export async function getKeyframes(id: number, until: number): Promise<number[]> {
  const { data } = await axios.get<{ keyframes: number[] }>(`/api/clips/${id}/keyframes`, {
    params: { until },
  });
  return data.keyframes;
}

/** Something the game itself put on screen, and when. */
export interface SuggestionEvent {
  kind: string;
  atSec: number;
  untilSec?: number;
  confidence: number;
  reason: string;
}

export interface ClipSuggestions {
  clipId: number;
  analyzed: boolean;
  /** False when the clip's sound never changes — the UI then shows nothing. */
  confident: boolean;
  reason: string | null;
  durationSec: number;
  window: { start: number; end: number } | null;
  moments: Array<{ t: number; score: number }>;
  spreadLu: number;
  peakZ: number;
  eventSec: number;
  bar: number;
  basis: 'rule' | 'model' | 'hud';
  /** Why this is being suggested, when the grounds are worth saying out loud. */
  evidence: string | null;
  /** What the game itself showed. Empty for a game with no module. */
  events: SuggestionEvent[];
  /** True when this game's clips get their screen read as well as heard. */
  watchesScreen: boolean;
}

/**
 * Which games have their screen read.
 *
 * Asked for once, before any clip is analysed, so the Trim page can say that a
 * wait is a few seconds of reading rather than a tenth of a second of
 * listening. Lower case, to compare against a folder name.
 */
export async function getHudWatchedGames(): Promise<string[]> {
  const { data } = await axios.get<{ games: string[] }>('/api/clips/suggestions/watchers');
  return data.games;
}

export async function getClipSuggestions(
  id: number,
  windowSec = 10,
): Promise<ClipSuggestions> {
  const { data } = await axios.get<ClipSuggestions>(`/api/clips/${id}/suggestions`, {
    params: { windowSec },
  });
  return data;
}

/** Say that a suggestion pointed at the wrong thing. */
export async function rejectSuggestion(id: number): Promise<void> {
  await axios.post(`/api/clips/${id}/suggestions/rejected`);
}

export interface LabelSummary {
  total: number;
  trims: number;
  accepted: number;
  rejected: number;
  withRanges: number;
  usable: number;
  needed: number;
  automatic: boolean;
  model: { trainedAt: string | null; examples: number | null; heldOutAccuracy: number | null } | null;
}

export interface FitReport {
  examples: number;
  positives: number;
  trainedOn: number;
  heldOut: number;
  accuracy: number;
  precision: number;
  recall: number;
  weights: Array<{ feature: string; weight: number }>;
}

/** Fit the suggestion model to every label so far, and start using it. */
export async function fitSuggestionModel(): Promise<
  { fitted: true; report: FitReport } | { fitted: false; reason: string; examples: number }
> {
  const { data } = await axios.post('/api/clips/suggestions/model/fit');
  return data;
}

/** Stop using the fitted model; the built-in rule decides again. */
export async function forgetSuggestionModel(): Promise<void> {
  await axios.delete('/api/clips/suggestions/model');
}

/** How much has been learned from, for the settings screen. */
export async function getLabelSummary(): Promise<LabelSummary> {
  const { data } = await axios.get<LabelSummary>('/api/clips/suggestions/labels');
  return data;
}

/** Every label, so it can be trained on. */
export async function getLabels(): Promise<unknown[]> {
  const { data } = await axios.get<unknown[]>('/api/clips/suggestions/labels/export');
  return data;
}

/** Stop a running render. */
export async function cancelExport(exportId: string): Promise<void> {
  await axios.delete(`/api/clips/export/${exportId}`);
}

export interface EncoderInfo {
  ffmpegVersion: string;
  h264: string;
  hardware: boolean;
  hwaccel: string | null;
}

export async function getEncoderInfo(): Promise<EncoderInfo> {
  const { data } = await axios.get<EncoderInfo>('/api/clips/system/encoders');
  return data;
}

/**
 * `compress` uploads a share-sized copy and leaves the file on disk alone;
 * `false` uploads the recording as it is. Left out, the compress-published
 * setting decides. Only for a clip that has not been published — the server
 * refuses a compressed copy of one already up.
 */
export async function publishClip(id: number, options: { compress?: boolean } = {}): Promise<Clip> {
  const { data } = await axios.post<Clip>(
    `/api/clips/${id}/publish`,
    options.compress === undefined ? {} : { compress: options.compress },
  );
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

/**
 * Import clips by path.
 *
 * Multipart form data cannot cross the contextBridge, so this arrived with no
 * body once the transport moved to IPC. Main is handed the paths and reads the
 * files itself — which is the right shape for a desktop app regardless, since
 * nothing has to pass through the renderer's memory.
 */
export async function importFiles(paths: string[]): Promise<ImportFilesResult> {
  const bridge = window.goodbit;
  if (!bridge) throw new Error('The GoodBit bridge is unavailable');
  return (await bridge.importClips(paths)) as ImportFilesResult;
}

/** Open the OS picker for video files. Returns an empty list if cancelled. */
export async function pickClipFiles(): Promise<string[]> {
  return (await window.goodbit?.pickFiles('video')) ?? [];
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

