import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for Game
 * Represents a game with its clip count
 */
export class GameDTO extends BaseDTO<GameDTO> {
  game!: string;
  clipCount!: number;

  /**
   * Create a GameDTO from query result
   */
  static fromQueryResult(result: any): GameDTO {
    const dto = new GameDTO();
    dto.game = result.game;
    dto.clipCount = parseInt(result.clipCount, 10) || 0;
    return dto;
  }

  /**
   * Validate game data
   */
  validate() {
    const errors: string[] = [];

    if (!this.game || this.game.trim() === '') {
      errors.push('Game name is required and cannot be empty');
    }

    if (this.clipCount < 0) {
      errors.push('Clip count cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}

