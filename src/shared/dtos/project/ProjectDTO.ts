import type { ClipAudioSelection } from '../clip/ClipAudioDTO.js';

import { BaseDTO } from '../BaseDTO.js';
import type { ExportFormat } from '../../constants/exportFormats.js';

export interface ProjectTimelineClip {
  clipId: number;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  originalDuration: number;
  volume: number;
  muted: boolean;
  /**
   * Mutes and levels for this clip's own audio tracks.
   *
   * `volume` turns the whole clip down; this turns one source inside it down,
   * which only exists on a recording made through GoodBit's multi-track OBS
   * setup. Absent on every draft written before it existed, which a reader has
   * to keep working with: a timeline saved last month is a timeline of clips
   * whose sound nobody had a way to take apart.
   */
  audio?: ClipAudioSelection[];
}

export interface ProjectTimelineAudio {
  trackId: string;
  name: string;
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

/**
 * A transition in the gap between two adjacent clips on the video lane.
 *
 * Positional, not keyed by clip id: the same clip can sit on the timeline more
 * than once, and the gap belongs to the order rather than to either side of
 * it. `afterIndex` is the index in `clips` of the clip on the left, so a
 * dissolve between the first and the second clip is `afterIndex: 0`.
 *
 * `type` is carried rather than implied, so a dip to black or a wipe can be
 * added later without a second field and a second code path. One value today.
 *
 * `durationSec` is the overlap, and the export takes it out of *both*
 * neighbours: the movie gets shorter by exactly that much. See
 * `services/exportPlan.ts` for why, and for what happens when a clip is too
 * short to give it up.
 */
export interface ProjectTimelineTransition {
  afterIndex: number;
  type: 'crossDissolve';
  durationSec: number;
}

export interface ProjectTimeline {
  clips: ProjectTimelineClip[];
  audio: ProjectTimelineAudio[];
  /** Absent on every draft written before 2.0, which is a timeline of hard cuts. */
  transitions?: ProjectTimelineTransition[];
}

/**
 * A saved timeline as it crosses the wire.
 *
 * `timeline` is parsed here rather than handed over as a string, so the client
 * never has to know it is stored as JSON in one column.
 */
export class ProjectDTO extends BaseDTO<ProjectDTO> {
  id!: number;
  name!: string;
  timeline!: ProjectTimeline;
  format!: ExportFormat;
  framePos!: number;
  normalizeLoudness!: boolean;
  archived!: boolean;
  createdAt!: string;
  updatedAt!: string;
  /** How many clips the timeline holds, for a card that does not need the whole thing. */
  clipCount!: number;

  static fromEntity(entity: {
    id: number;
    name: string;
    timeline: string;
    format: string;
    framePos: number;
    normalizeLoudness: boolean;
    archived: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ProjectDTO {
    const dto = new ProjectDTO();
    dto.id = entity.id;
    dto.name = entity.name;

    let parsed: ProjectTimeline = { clips: [], audio: [], transitions: [] };
    try {
      const raw = JSON.parse(entity.timeline ?? '{}') as Partial<ProjectTimeline>;
      parsed = {
        clips: raw.clips ?? [],
        audio: raw.audio ?? [],
        // A draft saved before transitions existed has no key here, and an
        // empty list is the same timeline it always was: all hard cuts.
        transitions: raw.transitions ?? [],
      };
    } catch {
      // A corrupt row should not take the whole list down with it.
    }

    dto.timeline = parsed;
    dto.clipCount = parsed.clips.length;
    dto.format = (entity.format as ExportFormat) ?? 'original';
    dto.framePos = entity.framePos ?? 0.5;
    dto.normalizeLoudness = !!entity.normalizeLoudness;
    dto.archived = !!entity.archived;
    dto.createdAt = entity.createdAt?.toISOString?.() ?? String(entity.createdAt);
    dto.updatedAt = entity.updatedAt?.toISOString?.() ?? String(entity.updatedAt);
    return dto;
  }

  validate(): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!this.name?.trim()) errors.push('A project needs a name');
    return { isValid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
