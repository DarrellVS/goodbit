import { BaseDTO } from '../BaseDTO.js';

/**
 * Data Transfer Object for Game
 * Represents a game with its clip count
 */
export class GameDTO extends BaseDTO<GameDTO> {
  game!: string;
  displayName!: string | null;
  clipCount!: number;
  hidden!: boolean;
  /**
   * The Steam appid, when this game is one.
   *
   * Carried so the client can ask for artwork and offer to launch the game,
   * without the client ever having to work out which game a folder is. Null
   * for everything that is not a Steam game, which is an ordinary answer.
   */
  steamAppId!: string | null;

  /**
   * Create a GameDTO from query result
   */
  static fromQueryResult(result: any): GameDTO {
    const dto = new GameDTO();
    dto.game = result.game;
    dto.displayName = result.displayName ?? null;
    dto.clipCount = parseInt(result.clipCount, 10) || 0;
    dto.hidden = result.hidden === true || result.hidden === 1;
    dto.steamAppId = result.steamAppId ?? null;
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

