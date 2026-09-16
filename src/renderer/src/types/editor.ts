import type { ProjectTimelineAudio, ProjectTimelineClip } from '@shared/index';

/**
 * What a stored timeline holds: ids, filenames and the edits made to them.
 *
 * The same shape the library's `project.timeline` column carries, aliased from
 * the DTO rather than declared again, because that column is now the only
 * place a named draft lives and a second definition of its contents is how the
 * two stores drifted apart in the first place. Media URLs are deliberately
 * absent: they are rebuilt on restore from whatever the clip's id resolves to
 * today.
 */
export type DraftClip = ProjectTimelineClip;
export type DraftAudio = ProjectTimelineAudio;

/** Enough of a draft to rebuild a timeline from. */
export interface DraftTimeline {
  name: string;
  clips: DraftClip[];
  audio: DraftAudio[];
}

/** A named draft, which is to say a row in the library's project table. */
export interface EditorDraft extends DraftTimeline {
  id: number;
  updatedAt: string;
}

/**
 * What the resume banner offers back when the editor opens.
 *
 * Either the local scratch timeline, which belongs to nothing and carries no
 * `projectId`, or a named draft picked back up, which does. See
 * `utils/draftResume.ts` for how one is chosen.
 */
export interface ResumableDraft extends DraftTimeline {
  updatedAt: string;
  projectId: number | null;
}

/** One local record on its way into the library, for the 2.0 migration. */
export interface DraftImportEntry {
  /** The key it has in the old local store, so a result can be matched to it. */
  localId: string;
  name: string;
  updatedAt: string;
  /** The row this record was mirroring, if it ever reached one. */
  projectId: number | null;
  clips: DraftClip[];
  audio: DraftAudio[];
}

export interface DraftImportResult {
  localId: string;
  outcome: 'created' | 'updated' | 'kept' | 'skipped';
  projectId?: number;
  reason?: 'empty' | 'too-large';
}

export interface DraftImportSummary {
  results: DraftImportResult[];
  created: number;
  updated: number;
  kept: number;
  skipped: number;
}

export interface TimelineClip {
  id: string;
  clipId: number;
  /** What the library calls it, so the block on the timeline says the same. */
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  muted: boolean;
  videoUrl: string;
  thumbnailUrl: string;
  originalDuration: number;
}

/**
 * A music track placed on the editor's audio lane.
 *
 * Unlike video clips these never reflow: they may sit anywhere, overlap each
 * other, and run past the end of the picture (the export cuts them there).
 */
export interface TimelineAudio {
  /** Instance id. The same library track can be placed more than once. */
  id: string;
  /** Filename of the track in the editor music folder. */
  trackId: string;
  name: string;
  url: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  originalDuration: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  muted: boolean;
}

export interface RulerMark {
  position: number;
  label: string;
}

export interface DragState {
  active: boolean;
  startX: number;
  initialValue: number;
}
