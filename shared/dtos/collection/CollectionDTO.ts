import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for Collection entity
 * Basic collection info without clips
 */
export class CollectionDTO extends BaseDTO<CollectionDTO, any> {
  id!: number;
  name!: string;
  clipCount!: number;
  createdAt!: string; // ISO string
  updatedAt!: string; // ISO string

  /**
   * Create a CollectionDTO from a database entity
   */
  static fromEntity(entity: any): CollectionDTO {
    const dto = new CollectionDTO();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.createdAt = entity.createdAt instanceof Date 
      ? entity.createdAt.toISOString() 
      : entity.createdAt;
    dto.updatedAt = entity.updatedAt instanceof Date 
      ? entity.updatedAt.toISOString() 
      : entity.updatedAt;
    
    // Calculate clip count from clips array if loaded, otherwise use provided count
    dto.clipCount = entity.clipCount ?? (entity.clips?.length || 0);
    
    return dto;
  }

  /**
   * Validate collection data
   */
  validate() {
    const errors: string[] = [];

    if (!this.name || this.name.trim() === '') {
      errors.push('Collection name is required and cannot be empty');
    }

    if (this.name && this.name.length > 255) {
      errors.push('Collection name cannot exceed 255 characters');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

