import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for Clip entity
 * Used for transferring clip data between server and client
 */
export class ClipDTO extends BaseDTO<ClipDTO, any> {
  id!: number;
  filePath!: string;
  relPath!: string;
  game!: string;
  filename!: string;
  displayName!: string | null;
  extension!: string;
  sizeBytes!: number;
  /** Seconds. Null for a row written before the scan started recording it. */
  durationSec?: number | null;
  /** When it was recorded, as opposed to when the file last changed. */
  recordedAt?: string | null;
  fileModifiedAt!: string; // ISO string for client compatibility
  createdAt?: string;
  updatedAt?: string;
  published!: boolean;
  publishedUrl!: string | null;
  starred!: boolean;
  notes!: string | null;
  /**
   * When this clip was last opened to be watched, and how often.
   *
   * Collected from 2.0 and read by nothing until the retention screen, which
   * wants to say "190 of these have never been opened". Null means never, not
   * zero: they are different claims, and never is what every row starts as.
   */
  lastOpenedAt?: string | null;
  openCount!: number;
  /**
   * How many moments the analysis is confident about, or null if nobody has
   * looked. Written by the sweep when a game closes; see the entity.
   */
  suggestedCount?: number | null;
  /**
   * Rendered by the editor rather than recorded by OBS.
   *
   * An export sits in its own game's folder and is a clip in every other
   * respect, so this is the one thing the card has to say about it.
   */
  isExport!: boolean;
  /**
   * How often the published copy has been opened, and when last.
   *
   * Null means nobody has counted, which is not zero. See the entity.
   */
  publisherViews?: number | null;
  publisherLastViewedAt?: string | null;
  tags?: string[]; // Tag names array

  /**
   * The marked ranges on this clip, when the list was asked to carry them.
   *
   * Start and end only, because the one thing reading this is the band drawn
   * over a library card: a name, a source and a confidence would be bytes per
   * clip per page for something no card shows. The panel asks
   * `GET /clips/:id/goodbits` when it needs the rest.
   *
   * Optional and absent rather than empty when nothing attached them, so
   * "this list does not carry GoodBits" and "this clip has none" stay
   * different answers.
   */
  goodBits?: Array<{ startSec: number; endSec: number }>;

  /**
   * Create a ClipDTO from a database entity
   */
  static fromEntity(entity: any): ClipDTO {
    const dto = new ClipDTO();
    dto.id = entity.id;
    dto.filePath = entity.filePath;
    dto.relPath = entity.relPath;
    dto.game = entity.game;
    dto.filename = entity.filename;
    dto.displayName = entity.displayName;
    dto.extension = entity.extension;
    dto.sizeBytes = entity.sizeBytes;
    dto.durationSec = entity.durationSec ?? null;
    dto.recordedAt = entity.recordedAt instanceof Date
      ? entity.recordedAt.toISOString()
      : (entity.recordedAt ?? null);
    dto.fileModifiedAt = entity.fileModifiedAt instanceof Date 
      ? entity.fileModifiedAt.toISOString() 
      : entity.fileModifiedAt;
    dto.createdAt = entity.createdAt instanceof Date 
      ? entity.createdAt.toISOString() 
      : entity.createdAt;
    dto.updatedAt = entity.updatedAt instanceof Date 
      ? entity.updatedAt.toISOString() 
      : entity.updatedAt;
    dto.published = entity.published ?? false;
    dto.publishedUrl = entity.publishedUrl ?? null;
    dto.starred = entity.starred ?? false;
    dto.notes = entity.notes ?? null;
    dto.lastOpenedAt = entity.lastOpenedAt instanceof Date
      ? entity.lastOpenedAt.toISOString()
      : (entity.lastOpenedAt ?? null);
    dto.openCount = entity.openCount ?? 0;
    dto.suggestedCount = entity.suggestedCount ?? null;
    dto.isExport = entity.isExport ?? false;
    dto.publisherViews = entity.publisherViews ?? null;
    dto.publisherLastViewedAt = entity.publisherLastViewedAt instanceof Date
      ? entity.publisherLastViewedAt.toISOString()
      : (entity.publisherLastViewedAt ?? null);
    
    // Extract tag names if tags relation is loaded
    if (entity.tags && Array.isArray(entity.tags)) {
      dto.tags = entity.tags.map((tag: any) => tag.name);
    }

    return dto;
  }

  /**
   * Validate clip data
   */
  validate() {
    const errors: string[] = [];

    if (!this.filename) {
      errors.push('Filename is required');
    }

    if (!this.game) {
      errors.push('Game is required');
    }

    if (!this.relPath) {
      errors.push('Relative path is required');
    }

    if (!this.filePath) {
      errors.push('File path is required');
    }

    if (this.sizeBytes < 0) {
      errors.push('File size cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

