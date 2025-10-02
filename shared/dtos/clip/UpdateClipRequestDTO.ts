import { BaseDTO } from '../BaseDTO.js';

/**
 * DTO for updating clip properties
 * Contains only the fields that can be updated by the user
 */
export class UpdateClipRequestDTO extends BaseDTO<UpdateClipRequestDTO> {
  displayName?: string | null;
  starred?: boolean;
  notes?: string | null;
  tags?: string[];

  /**
   * Validate update request
   */
  validate() {
    const errors: string[] = [];

    // Display name can be null or string, but if string, should not be empty
    if (this.displayName !== undefined && this.displayName !== null && this.displayName.trim() === '') {
      errors.push('Display name cannot be empty string');
    }

    // Tags should be an array of non-empty strings
    if (this.tags !== undefined) {
      if (!Array.isArray(this.tags)) {
        errors.push('Tags must be an array');
      } else {
        const invalidTags = this.tags.filter(tag => typeof tag !== 'string' || tag.trim() === '');
        if (invalidTags.length > 0) {
          errors.push('All tags must be non-empty strings');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

