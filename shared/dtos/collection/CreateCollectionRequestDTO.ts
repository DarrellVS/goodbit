import { BaseDTO } from '../BaseDTO.js';

/**
 * DTO for creating a new collection
 */
export class CreateCollectionRequestDTO extends BaseDTO<CreateCollectionRequestDTO> {
  name!: string;

  /**
   * Validate create collection request
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

