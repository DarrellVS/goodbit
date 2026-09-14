import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for a music file available to the editor.
 *
 * Audio tracks have no database row. The files under the editor's music
 * folder are the whole story, so the DTO is built from a stat + probe rather
 * than from an entity. The filename doubles as the id.
 */
export class AudioTrackDTO extends BaseDTO<AudioTrackDTO> {
  id!: string;
  filename!: string;
  displayName!: string;
  extension!: string;
  sizeBytes!: number;
  durationSec!: number;
  modifiedAt!: string;

  static fromFile(input: {
    filename: string;
    extension: string;
    sizeBytes: number;
    durationSec: number;
    modifiedAt: Date | string;
  }): AudioTrackDTO {
    const dto = new AudioTrackDTO();
    dto.id = input.filename;
    dto.filename = input.filename;
    dto.displayName = input.filename.replace(/\.[^.]+$/, '');
    dto.extension = input.extension;
    dto.sizeBytes = input.sizeBytes;
    dto.durationSec = input.durationSec;
    dto.modifiedAt =
      input.modifiedAt instanceof Date ? input.modifiedAt.toISOString() : input.modifiedAt;
    return dto;
  }

  validate() {
    const errors: string[] = [];

    if (!this.filename || this.filename.trim() === '') {
      errors.push('Filename is required and cannot be empty');
    }

    if (this.durationSec < 0) {
      errors.push('Duration cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
