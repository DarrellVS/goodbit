import { BaseDTO } from '../BaseDTO.js';
import { ClipDTO } from '../clip/ClipDTO.js';

/**
 * Data Transfer Object for Collection with full clip details
 * Used when fetching a collection with all its clips
 */
export class CollectionWithClipsDTO extends BaseDTO<CollectionWithClipsDTO, any> {
  id!: number;
  name!: string;
  createdAt!: string;
  updatedAt!: string;
  clips!: ClipDTO[];

  /**
   * Create a CollectionWithClipsDTO from a database entity
   */
  static fromEntity(entity: any): CollectionWithClipsDTO {
    const dto = new CollectionWithClipsDTO();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.createdAt = entity.createdAt instanceof Date 
      ? entity.createdAt.toISOString() 
      : entity.createdAt;
    dto.updatedAt = entity.updatedAt instanceof Date 
      ? entity.updatedAt.toISOString() 
      : entity.updatedAt;
    
    // Convert clips to DTOs
    dto.clips = entity.clips?.map((clip: any) => ClipDTO.fromEntity(clip)) || [];
    
    return dto;
  }

  /**
   * Validate collection with clips data
   */
  validate() {
    const errors: string[] = [];

    if (!this.name || this.name.trim() === '') {
      errors.push('Collection name is required and cannot be empty');
    }

    if (!Array.isArray(this.clips)) {
      errors.push('Clips must be an array');
    } else {
      // Validate each clip
      this.clips.forEach((clip, index) => {
        const clipValidation = clip.validate?.();
        if (clipValidation && !clipValidation.isValid) {
          errors.push(`Clip at index ${index} is invalid: ${clipValidation.errors?.join(', ')}`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

