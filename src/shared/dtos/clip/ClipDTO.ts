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
  fileModifiedAt!: string; // ISO string for client compatibility
  createdAt?: string;
  updatedAt?: string;
  published!: boolean;
  publishedUrl!: string | null;
  starred!: boolean;
  notes!: string | null;
  tags?: string[]; // Tag names array

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

