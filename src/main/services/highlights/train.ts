import { unlinkSync, writeFileSync } from 'node:fs';
import { FEATURE_NAMES } from './features.js';
import { forgetModel, loadModel, modelPath, type HighlightModel } from './model.js';
import { exportLabels } from './labels.js';
import { loadSettings } from '../../settings.js';
import type { HighlightLabel } from '../../entity/HighlightLabel.js';

/**
 * Fitting the model, inside the app, without asking anyone to run anything.
 *
 * Logistic regression over seven features is eighty lines of arithmetic and a
 * few milliseconds, so there was never a reason for it to live in a script that
 * a person had to find, export a file for, and run. It happens here, on its
 * own, whenever there is enough new evidence, and Settings → Advanced shows
 * what it did and offers to undo it.
 */

/** Below this the weights would memorise a handful of clips, not describe a taste. */
export const MIN_EXAMPLES = 60;
/** Fit again once this many new usable labels have arrived since the last fit. */
export const REFIT_EVERY = 25;
/** At least this many of each class, or there is nothing to tell apart. */
const MIN_PER_CLASS = 10;

interface Example {
  x: number[];
  label: 0 | 1;
}

/**
 * A label becomes an example of "worth suggesting" or "not".
 *
 * `accepted`. The suggestion was taken as offered. `rejected`, shown and
 * called wrong. `trim`, cut somewhere; positive if what was kept mostly
 * overlaps what was suggested, negative if the suggestion pointed elsewhere. A
 * trim with no suggestion on screen says nothing about the decision.
 */
export function toExample(row: HighlightLabel): Example | null {
  if (row.peakZ === null || row.spreadLu === null || row.eventSec === null) return null;
  if (row.suggestedStartSec === null || row.suggestedEndSec === null) return null;

  const duration = row.durationSec || 1;
  const suggestedMid = (row.suggestedStartSec + row.suggestedEndSec) / 2;

  // Some features are not stored on the row and are rebuilt from what is:
  // position from where the suggestion sat, the rest as their neutral value.
  // Stored features carry the signal; these keep the vector the right shape.
  const x: number[] = FEATURE_NAMES.map((name) => {
    switch (name) {
      case 'peakZ': return row.peakZ!;
      case 'spreadLu': return row.spreadLu!;
      case 'eventSec': return row.eventSec!;
      case 'position': return suggestedMid / duration;
      case 'durationSec': return duration;
      case 'busyness': return 0;
      case 'runnerUpZ': return 0;
      default: return 0;
    }
  });

  if (row.source === 'accepted') return { x, label: 1 };
  if (row.source === 'rejected') return { x, label: 0 };

  if (row.source === 'trim' && row.chosenStartSec !== null && row.chosenEndSec !== null) {
    const overlap =
      Math.min(row.chosenEndSec, row.suggestedEndSec) -
      Math.max(row.chosenStartSec, row.suggestedStartSec);
    const chosen = row.chosenEndSec - row.chosenStartSec;
    return { x, label: chosen > 0 && overlap / chosen > 0.5 ? 1 : 0 };
  }

  return null;
}

export interface FitReport {
  examples: number;
  positives: number;
  trainedOn: number;
  heldOut: number;
  /** On the held-out fifth, so not the examples it was fitted to. */
  accuracy: number;
  precision: number;
  recall: number;
  weights: Array<{ feature: string; weight: number }>;
}

export type FitOutcome =
  | { fitted: true; model: HighlightModel; report: FitReport }
  | { fitted: false; reason: string; examples: number };

/** Fit to the rows given. Pure: writes nothing. */
export function fit(rows: HighlightLabel[]): FitOutcome {
  const examples = rows.map(toExample).filter((e): e is Example => e !== null);
  const positives = examples.filter((e) => e.label === 1).length;

  if (examples.length < MIN_EXAMPLES) {
    return {
      fitted: false,
      examples: examples.length,
      reason: `${examples.length} of ${MIN_EXAMPLES} examples`,
    };
  }
  if (positives < MIN_PER_CLASS || examples.length - positives < MIN_PER_CLASS) {
    return {
      fitted: false,
      examples: examples.length,
      reason: 'too one-sided to learn from yet',
    };
  }

  // Deterministic shuffle, so two fits on the same rows agree.
  const shuffled = [...examples];
  let seed = 1234567;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const n = FEATURE_NAMES.length;
  const mean = new Array<number>(n).fill(0);
  const sd = new Array<number>(n).fill(0);
  for (const e of shuffled) for (let i = 0; i < n; i++) mean[i] += e.x[i] / shuffled.length;
  for (const e of shuffled) for (let i = 0; i < n; i++) sd[i] += (e.x[i] - mean[i]) ** 2 / shuffled.length;
  for (let i = 0; i < n; i++) sd[i] = Math.sqrt(sd[i]) || 1;

  const standardised = shuffled.map((e) => ({
    label: e.label,
    x: e.x.map((v, i) => (v - mean[i]) / sd[i]),
  }));

  const cut = Math.floor(standardised.length * 0.8);
  const train = standardised.slice(0, cut);
  const test = standardised.slice(cut);

  // Gradient descent with a little L2. Seven weights; this is not the slow part.
  const w = new Array<number>(n).fill(0);
  let b = 0;
  for (let step = 0; step < 4000; step++) {
    const gw = new Array<number>(n).fill(0);
    let gb = 0;
    for (const { x, label } of train) {
      let z = b;
      for (let i = 0; i < n; i++) z += w[i] * x[i];
      const err = 1 / (1 + Math.exp(-z)) - label;
      for (let i = 0; i < n; i++) gw[i] += (err * x[i]) / train.length;
      gb += err / train.length;
    }
    for (let i = 0; i < n; i++) w[i] -= 0.1 * (gw[i] + 0.01 * w[i]);
    b -= 0.1 * gb;
  }

  const score = (rows2: typeof test) => {
    let right = 0;
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const { x, label } of rows2) {
      let z = b;
      for (let i = 0; i < n; i++) z += w[i] * x[i];
      const p = 1 / (1 + Math.exp(-z)) >= 0.5 ? 1 : 0;
      if (p === label) right++;
      if (p === 1 && label === 1) tp++;
      if (p === 1 && label === 0) fp++;
      if (p === 0 && label === 1) fn++;
    }
    return {
      accuracy: rows2.length ? right / rows2.length : 0,
      precision: tp + fp ? tp / (tp + fp) : 0,
      recall: tp + fn ? tp / (tp + fn) : 0,
    };
  };

  const onTest = score(test.length ? test : train);

  // The app scores raw features, so the standardisation is folded into the
  // weights rather than stored alongside them.
  const weights = w.map((v, i) => v / sd[i]);
  const bias = b - w.reduce((acc, v, i) => acc + (v * mean[i]) / sd[i], 0);

  const model: HighlightModel = {
    version: 1,
    features: [...FEATURE_NAMES],
    weights,
    bias,
    threshold: 0.5,
    trainedAt: new Date().toISOString(),
    examples: examples.length,
    heldOutAccuracy: Math.round(onTest.accuracy * 100) / 100,
  };

  return {
    fitted: true,
    model,
    report: {
      examples: examples.length,
      positives,
      trainedOn: train.length,
      heldOut: test.length,
      accuracy: onTest.accuracy,
      precision: onTest.precision,
      recall: onTest.recall,
      weights: FEATURE_NAMES.map((feature, i) => ({ feature, weight: w[i] })).sort(
        (p, q) => Math.abs(q.weight) - Math.abs(p.weight),
      ),
    },
  };
}

/** Fit to everything recorded so far and, if that produced a model, start using it. */
export async function fitNow(): Promise<FitOutcome> {
  const outcome = fit(await exportLabels());
  if (outcome.fitted) {
    writeFileSync(modelPath(), JSON.stringify(outcome.model, null, 2), 'utf-8');
    forgetModel();
    console.log(
      `[highlights] fitted a model to ${outcome.report.examples} examples ` +
        `(held-out accuracy ${Math.round(outcome.report.accuracy * 100)}%)`,
    );
  }
  return outcome;
}

/**
 * Called after every label is written. Fits when there is enough, and again
 * whenever enough has been added since, so the model keeps up with a person
 * without them doing anything, and Settings → Advanced can say when it did.
 */
export async function refitIfDue(): Promise<void> {
  if (loadSettings().learnFromTrims === false) return;

  try {
    const rows = await exportLabels();
    const usable = rows.filter((r) => toExample(r) !== null).length;
    if (usable < MIN_EXAMPLES) return;

    const current = loadModel();
    if (current && (current.examples ?? 0) + REFIT_EVERY > usable) return;

    await fitNow();
  } catch (error) {
    console.error('[highlights] could not refit:', error);
  }
}

/** Go back to the built-in rule. */
export function forgetLearnedModel(): boolean {
  try {
    unlinkSync(modelPath());
    forgetModel();
    return true;
  } catch {
    return false;
  }
}
