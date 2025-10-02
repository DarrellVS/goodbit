import { BaseDTO } from '../BaseDTO.js';

/**
 * DTO for updating collection properties
 */
export class UpdateCollectionRequestDTO extends BaseDTO<UpdateCollectionRequestDTO> {
  name?: string;

  /**
   * Validate update collection request
   */
  validate() {
    const errors: string[] = [];

    if (this.name !== undefined) {
      if (!this.name || this.name.trim() === '') {
        errors.push('Collection name cannot be empty');
      }

      if (this.name.length > 255) {
        errors.push('Collection name cannot exceed 255 characters');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

