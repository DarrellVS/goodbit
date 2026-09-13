/**
 * Base class for all Data Transfer Objects (DTOs)
 * Provides common functionality for validation and entity conversion
 * 
 * @template T - The DTO type itself (for fluent interfaces)
 * @template E - The entity type that this DTO represents
 */
export abstract class BaseDTO<T = any, E = any> {
  /**
   * Optional method to create a DTO instance from a database entity
   * Override this method in child classes to implement entity-to-DTO conversion
   * 
   * @param entity - The database entity to convert
   * @returns A new DTO instance populated with entity data
   * 
   * @example
   * class ClipDTO extends BaseDTO<ClipDTO, Clip> {
   *   static fromEntity(entity: Clip): ClipDTO {
   *     const dto = new ClipDTO();
   *     dto.id = entity.id;
   *     dto.filename = entity.filename;
   *     return dto;
   *   }
   * }
   */
  static fromEntity?(entity: any): any {
    throw new Error('fromEntity method not implemented');
  }

  /**
   * Optional method to validate the DTO data
   * Override this method in child classes to implement custom validation logic
   * 
   * @returns An object containing validation result and optional error messages
   * 
   * @example
   * class ClipDTO extends BaseDTO<ClipDTO, Clip> {
   *   validate() {
   *     const errors: string[] = [];
   *     if (!this.filename) {
   *       errors.push('Filename is required');
   *     }
   *     return {
   *       isValid: errors.length === 0,
   *       errors: errors.length > 0 ? errors : undefined
   *     };
   *   }
   * }
   */
  validate?(): {
    isValid: boolean;
    errors?: string[];
  } {
    // Default implementation: always valid
    return { isValid: true };
  }

  /**
   * Helper method to convert the DTO to a plain object
   * Useful for serialization and API responses
   * 
   * @returns A plain object representation of the DTO
   */
  toJSON(): Record<string, any> {
    return { ...this };
  }

  /**
   * Helper method to create a shallow copy of the DTO
   * 
   * @returns A new instance with the same property values
   */
  clone(): T {
    const Constructor = this.constructor as new () => T;
    const cloned = new Constructor();
    return Object.assign(cloned as object, this) as T;
  }
}

