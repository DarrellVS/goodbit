import { AppDataSource } from '../../data-source.js';
import { HighlightLabel } from '../../entity/HighlightLabel.js';
import { loadModel } from './model.js';
import { loadSettings } from '../../settings.js';

/**
 * Keeping what people decide, so it can be learned from later.
 *
 * Writing a label must never be able to fail the thing it is observing: a trim
 * that worked has worked, whether or not a row was written about it. Everything
 * here swallows its own errors on purpose.
 */

export interface TrimLabel {
  clipId: number;
  game: string;
  durationSec: number;
  chosenStartSec: number;
  chosenEndSec: number;
  /** What was on screen when they cut, if anything. */
  suggested?: { start: number; end: number } | null;
  peakZ?: number | null;
  spreadLu?: number | null;
  eventSec?: number | null;
}

export async function recordTrim(label: TrimLabel): Promise<void> {
  await write({
    ...label,
    // A trim that lands on the suggestion is an acceptance of it, and a trim
    // somewhere else is a correction. Both are useful; the difference matters.
    source: labelKind(label),
  });
}

/**
 * Whether a chosen range counts as taking the suggestion or correcting it.
 *
 * Exported so the classification can be asserted without a database. It is the
 * one number in this file that is a judgement rather than a record: 0.4s at
 * both ends, which is loose enough that nudging a handle by a frame is still
 * agreement and tight enough that cutting somewhere else is not.
 */
export function labelKind(label: TrimLabel): 'accepted' | 'trim' {
  return agrees(label) ? 'accepted' : 'trim';
}

/** Someone was shown a suggestion and said it was wrong. */
export async function recordRejection(label: {
  clipId: number;
  game: string;
  durationSec: number;
  suggested: { start: number; end: number } | null;
  peakZ?: number | null;
  spreadLu?: number | null;
  eventSec?: number | null;
}): Promise<void> {
  await write({ ...label, source: 'rejected' });
}

function agrees(label: TrimLabel): boolean {
  if (!label.suggested) return false;
  return (
    Math.abs(label.chosenStartSec - label.suggested.start) < 0.4 &&
    Math.abs(label.chosenEndSec - label.suggested.end) < 0.4
  );
}

async function write(input: {
  clipId: number;
  game: string;
  durationSec: number;
  source: 'trim' | 'accepted' | 'rejected';
  chosenStartSec?: number;
  chosenEndSec?: number;
  suggested?: { start: number; end: number } | null;
  peakZ?: number | null;
  spreadLu?: number | null;
  eventSec?: number | null;
}): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(HighlightLabel);
    const row = repo.create({
      clipId: input.clipId,
      game: input.game,
      durationSec: round(input.durationSec),
      source: input.source,
      chosenStartSec: input.chosenStartSec === undefined ? null : round(input.chosenStartSec),
      chosenEndSec: input.chosenEndSec === undefined ? null : round(input.chosenEndSec),
      suggestedStartSec: input.suggested ? round(input.suggested.start) : null,
      suggestedEndSec: input.suggested ? round(input.suggested.end) : null,
      peakZ: input.peakZ ?? null,
      spreadLu: input.spreadLu ?? null,
      eventSec: input.eventSec ?? null,
    });
    await repo.save(row);
  } catch (error) {
    console.error('[highlights] could not record a label:', error);
    return;
  }

  // Each new label is a chance to learn from all of them. Not awaited: the
  // trim that produced it is already done, and a fit takes milliseconds anyway.
  void import('./train.js').then((m) => m.refitIfDue());
}

export interface LabelSummary {
  total: number;
  trims: number;
  accepted: number;
  rejected: number;
  /** How many are usable for training: they say where a person actually cut. */
  withRanges: number;
  /** The trained model in use, if there is one. */
  model: { trainedAt: string | null; examples: number | null; heldOutAccuracy: number | null } | null;
  /** How many labels can actually be learned from: a decision with a suggestion on screen. */
  usable: number;
  /** The floor before a model is fitted at all. */
  needed: number;
  /** Whether fitting happens on its own as labels arrive. */
  automatic: boolean;
}

export async function summarise(): Promise<LabelSummary> {
  const model = loadModel();
  const { MIN_EXAMPLES, toExample } = await import('./train.js');
  const empty: LabelSummary = {
    total: 0,
    trims: 0,
    accepted: 0,
    rejected: 0,
    withRanges: 0,
    usable: 0,
    needed: MIN_EXAMPLES,
    automatic: loadSettings().learnFromTrims !== false,
    model: model
      ? {
          trainedAt: model.trainedAt ?? null,
          examples: model.examples ?? null,
          heldOutAccuracy: model.heldOutAccuracy ?? null,
        }
      : null,
  };

  try {
    const rows = await AppDataSource.getRepository(HighlightLabel).find();

    return rows.reduce((acc, row) => {
      acc.total++;
      if (row.source === 'trim') acc.trims++;
      if (row.source === 'accepted') acc.accepted++;
      if (row.source === 'rejected') acc.rejected++;
      if (row.chosenStartSec !== null) acc.withRanges++;
      if (toExample(row) !== null) acc.usable++;
      return acc;
    }, empty);
  } catch {
    return empty;
  }
}

/** Everything, for the trainer. */
export async function exportLabels(): Promise<HighlightLabel[]> {
  try {
    return await AppDataSource.getRepository(HighlightLabel).find({ order: { id: 'ASC' } });
  } catch {
    return [];
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
