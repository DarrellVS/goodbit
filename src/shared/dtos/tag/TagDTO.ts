import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for Tag entity
 */
export class TagDTO extends BaseDTO<TagDTO, any> {
  id!: number;
  name!: string;

  /**
   * How many visible clips carry this tag.
   *
   * A filter has to say what it would do. The library's filter panel lists
   * every tag and a tag with no clips behind it is a row that can only empty
   * the screen, which is exactly the case somebody needs warning about.
   *
   * Counted the way the library counts, so hidden games are left out and the
   * number matches the list the filter produces. `0` when the caller did not
   * ask for counts, rather than `undefined`, so a template never has to.
   */
  clipCount!: number;

  /**
   * Create a TagDTO from a database entity
   */
  static fromEntity(entity: any, clipCount = 0): TagDTO {
    const dto = new TagDTO();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.clipCount = clipCount;
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

