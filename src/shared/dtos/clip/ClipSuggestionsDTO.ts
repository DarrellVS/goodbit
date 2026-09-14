import { BaseDTO } from '../BaseDTO.js';

/** A moment the analysis wants to point at, and why. */
export interface SuggestedMoment {
  /** Seconds into the clip. */
  t: number;
  /** 0..1, how far above this clip's own normal the moment is. */
  score: number;
}

/**
 * What one cheap listen to a clip found.
 *
 * `confident` is the whole point: a clip whose sound never changes has nothing
 * to point at, and saying so is better than inventing a suggestion. The UI
 * shows nothing at all when this is false.
 */
export class ClipSuggestionsDTO extends BaseDTO<ClipSuggestionsDTO> {
  clipId!: number;
  /** False when the clip has no audio, is too short, or is silent. */
  analyzed!: boolean;
  confident!: boolean;
  /** Why there is no suggestion, in plain words. Null when there is one. */
  reason!: string | null;
  durationSec!: number;
  /** The best window found, in seconds. Null when not confident. */
  window!: { start: number; end: number } | null;
  moments!: SuggestedMoment[];
  /** Spread between the quiet and loud parts of this clip, in LU. */
  spreadLu!: number;
  /** How much better the window is than the clip's average. */
  /** How far the loudest moment stood above the clip's own normal. */
  peakZ!: number;

  /** How long the loud part lasted, which sets how long the suggestion is. */
  eventSec!: number;

  /**
   * What the moment had to clear. Usually the fixed floor, but higher in a game
   * whose clips all stand out — see the calibration note in the main process.
   */
  bar!: number;

  /** Whether the verdict came from the shipped rule or from a trained model. */
  basis!: 'rule' | 'model';

  static fromAnalysis(clipId: number, a: {
    analyzed: boolean;
    confident: boolean;
    reason: string | null;
    durationSec: number;
    window: { start: number; end: number } | null;
    moments: SuggestedMoment[];
    spreadLu: number;
    peakZ: number;
    eventSec: number;
    bar?: number;
    basis?: 'rule' | 'model';
  }): ClipSuggestionsDTO {
    const dto = new ClipSuggestionsDTO();
    dto.clipId = clipId;
    dto.analyzed = a.analyzed;
    dto.confident = a.confident;
    dto.reason = a.reason;
    dto.durationSec = a.durationSec;
    dto.window = a.window;
    dto.moments = a.moments;
    dto.spreadLu = a.spreadLu;
    dto.peakZ = a.peakZ;
    dto.eventSec = a.eventSec;
    dto.bar = a.bar ?? 0;
    dto.basis = a.basis ?? 'rule';
    return dto;
  }
}
