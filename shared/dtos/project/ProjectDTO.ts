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

export interface ProjectTimeline {
  clips: ProjectTimelineClip[];
  audio: ProjectTimelineAudio[];
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

    let parsed: ProjectTimeline = { clips: [], audio: [] };
    try {
      const raw = JSON.parse(entity.timeline ?? '{}') as Partial<ProjectTimeline>;
      parsed = { clips: raw.clips ?? [], audio: raw.audio ?? [] };
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
