import type { EditorDraft, EditorDraftAudio, EditorDraftClip } from '../services/editorDraftsDb';

/**
 * Draft files: a draft on its way out of the browser and back in.
 *
 * The file is plain JSON carrying the same thing IndexedDB holds, clip ids,
 * track filenames and the edits, so a draft only replays on a machine whose
 * library has those clips and whose music folder has those tracks. Restoring
 * already drops what it cannot find, so a partial match degrades rather than
 * fails.
 */

const FILE_FORMAT = 'goodbit-editor-draft';
const FILE_VERSION = 1;
const FILE_SUFFIX = '.goodbit-draft.json';

/** What drafts were called before the app was. Still readable, never written. */
const LEGACY_FILE_FORMAT = 'filmpje-editor-draft';

export interface DraftFilePayload {
  name: string;
  clips: EditorDraftClip[];
  audio: EditorDraftAudio[];
}

export function draftFileName(name: string): string {
  const base =
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .trim()
      .slice(0, 80) || 'draft';

  return `${base}${FILE_SUFFIX}`;
}

export function downloadDraft(draft: EditorDraft): void {
  const payload = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: draft.name,
    exportedAt: new Date().toISOString(),
    clips: draft.clips,
    audio: draft.audio,
  };

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  );

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = draftFileName(draft.name);
  anchor.click();

  URL.revokeObjectURL(url);
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readClip(raw: unknown, index: number): EditorDraftClip {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const clipId = Number(entry.clipId);

  if (!Number.isInteger(clipId)) {
    throw new Error(`Clip ${index + 1} has no valid clip id`);
  }

  const trimStart = num(entry.trimStart);
  const trimEnd = num(entry.trimEnd, trimStart);
  const originalDuration = num(entry.originalDuration, trimEnd);

  return {
    clipId,
    startTime: num(entry.startTime),
    duration: num(entry.duration, Math.max(0, trimEnd - trimStart)),
    trimStart,
    trimEnd,
    originalDuration,
    volume: num(entry.volume, 1),
    muted: entry.muted === true,
  };
}

function readAudio(raw: unknown, index: number): EditorDraftAudio {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const trackId = typeof entry.trackId === 'string' ? entry.trackId : '';

  if (!trackId) {
    throw new Error(`Track ${index + 1} has no valid track id`);
  }

  const trimStart = num(entry.trimStart);
  const trimEnd = num(entry.trimEnd, trimStart);
  const originalDuration = num(entry.originalDuration, trimEnd);
  const duration = num(entry.duration, Math.max(0, trimEnd - trimStart));

  return {
    trackId,
    name: typeof entry.name === 'string' && entry.name ? entry.name : trackId,
    startTime: num(entry.startTime),
    duration,
    trimStart,
    trimEnd,
    originalDuration,
    volume: num(entry.volume, 1),
    muted: entry.muted === true,
    fadeIn: num(entry.fadeIn),
    fadeOut: num(entry.fadeOut),
  };
}

/** Throws with a message worth showing the user when the file is not a draft. */
export function parseDraftFile(text: string): DraftFilePayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON');
  }

  const file = (parsed ?? {}) as Record<string, unknown>;

  if (file.format !== FILE_FORMAT && file.format !== LEGACY_FILE_FORMAT) {
    throw new Error('That file is not a GoodBit draft');
  }

  if (num(file.version, 0) > FILE_VERSION) {
    throw new Error('That draft was written by a newer version of GoodBit');
  }

  const clips = Array.isArray(file.clips) ? file.clips : [];
  const audio = Array.isArray(file.audio) ? file.audio : [];

  if (clips.length === 0 && audio.length === 0) {
    throw new Error('That draft is empty');
  }

  return {
    name: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : 'Imported draft',
    clips: clips.map(readClip),
    audio: audio.map(readAudio),
  };
}
