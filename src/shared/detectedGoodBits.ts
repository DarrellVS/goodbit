/**
 * What a detected moment is written down as, and when it is written.
 *
 * Every moment the analysis is sure of becomes a GoodBit on its own: a kill or
 * a death the screen read, or, for a clip whose sound alone made the verdict,
 * its loudest instant. It used to wait for somebody to press keep, which meant
 * a clip could say "1 GoodBit found" on its card and open onto a list saying
 * nothing was marked.
 *
 * A mark is not a cut, so it is tight around the instant rather than the six
 * second window a suggested trim gets (`MIN_WINDOW_SEC`, there so a cut does
 * not read as a jump cut): half a second before, a second after, and never
 * outside the clip. A GoodBit has two handles and can be widened in a second.
 *
 * Pure, so `tests/unit` owns it; main writes the rows (`services/detectedGoodBits.ts`).
 */

/** How long before the instant a detected GoodBit starts. */
export const DETECTED_LEAD_SEC = 0.5;
/** How long after the instant, or after the end of a moment that spans time, it runs. */
export const DETECTED_TAIL_SEC = 1;
/** The shortest range worth keeping, the same floor a hand-made GoodBit has. */
const MIN_SEC = 0.1;

export interface DetectedMoment {
  atSec: number;
  /** A moment that lasts, like two kills a few seconds apart, ends here. */
  untilSec?: number;
}

export interface DetectedRange {
  startSec: number;
  endSec: number;
}

/** To the tenth, the step the trimmer's handles move in. */
function tenth(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/**
 * The range for one moment inside a clip `durationSec` long.
 *
 * A kill at 29.5 in a 30 second clip ends at 30, not at 30.5. Null when there
 * is no sensible range: a clip of no length, or an instant outside it.
 */
export function detectedRange(moment: DetectedMoment, durationSec: number | null | undefined): DetectedRange | null {
  const at = Number(moment.atSec);
  if (!Number.isFinite(at)) return null;
  const length = Number.isFinite(durationSec) && (durationSec as number) > 0 ? (durationSec as number) : null;
  if (length !== null && (at < 0 || at > length)) return null;

  const until = Math.max(at, Number.isFinite(moment.untilSec) ? (moment.untilSec as number) : at);
  const cap = (value: number): number => (length === null ? Math.max(0, value) : Math.min(Math.max(0, value), length));

  let startSec = cap(at - DETECTED_LEAD_SEC);
  const endSec = cap(until + DETECTED_TAIL_SEC);
  // Against the very end of a clip there may be less than the floor left
  // after the instant; take it from before instead.
  if (endSec - startSec < MIN_SEC) startSec = cap(endSec - MIN_SEC);
  if (endSec - startSec < MIN_SEC) return null;

  // To the tenth, with the end rounded down rather than up where rounding up
  // would carry it past the clip's last frame.
  const start = tenth(startSec);
  const end = length !== null && tenth(endSec) > length ? Math.floor(endSec * 10) / 10 : tenth(endSec);
  return { startSec: start, endSec: Math.max(end, tenth(start + MIN_SEC)) };
}

/** Whether an instant already sits inside something marked, so it is not marked twice. */
export function alreadyMarked(atSec: number, existing: readonly DetectedRange[]): boolean {
  return existing.some((range) => atSec >= range.startSec && atSec <= range.endSec);
}

/**
 * What to call a detected moment: the `kind` a module stamped on it, as a
 * word. `kill` reads as "Kill" in a list, and the full sentence is the
 * GoodBit's `reason`. The keep chips in the trimmer show the same word.
 */
export function momentName(kind: string | null | undefined): string | null {
  const words = (kind ?? '').replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
}

/** One instant worth a GoodBit, and what the row should say about it. */
export interface FoundMoment extends DetectedMoment {
  name: string | null;
  source: 'hud' | 'audio';
  reason: string | null;
  confidence: number | null;
}

/** The parts of an analysis this reads. Structural, so main's result fits. */
export interface AnalysisVerdict {
  anchors: ReadonlyArray<{ kind: string; atSec: number; untilSec?: number; confidence: number; reason: string }>;
  confident: boolean;
  /** Where the sound peaked inside the suggested window, with how far above normal. */
  goodBits: ReadonlyArray<{ t: number; score: number }>;
  reason: string | null;
  evidence?: string | null;
}

/**
 * What an analysis is sure of, as instants, which is the same thing
 * `suggestedCount` counts: the screen's moments when it read any, and
 * otherwise, for a verdict made on the sound alone, its loudest instant.
 * Empty when it is sure of nothing.
 */
export function momentsOf(result: AnalysisVerdict): FoundMoment[] {
  if (result.anchors.length) {
    return result.anchors.map((anchor) => ({
      atSec: anchor.atSec,
      untilSec: anchor.untilSec,
      name: momentName(anchor.kind),
      source: 'hud',
      reason: anchor.reason,
      confidence: anchor.confidence,
    }));
  }
  if (!result.confident || !result.goodBits.length) return [];
  const loudest = [...result.goodBits].sort((a, b) => b.score - a.score)[0];
  return [
    {
      atSec: loudest.t,
      name: null,
      source: 'audio',
      reason: result.evidence ?? result.reason,
      confidence: loudest.score,
    },
  ];
}
