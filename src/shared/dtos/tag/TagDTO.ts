import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for Tag entity
 */
export class TagDTO extends BaseDTO<TagDTO, any> {
  id!: number;
  name!: string;

  /**
   * Create a TagDTO from a database entity
   */
  static fromEntity(entity: any): TagDTO {
    const dto = new TagDTO();
    dto.id = entity.id;
    dto.name = entity.name;
    return dto;
  }

  /**
   * Validate tag data
   */
  validate() {
    const errors: string[] = [];

    if (!this.name || this.name.trim() === '') {
      errors.push('Tag name is required and cannot be empty');
    }

    if (this.name && this.name.length > 100) {
      errors.push('Tag name cannot exceed 100 characters');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

