import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { userDataDir } from '../../settings.js';
import { FEATURE_NAMES, toVector, type HighlightFeatures } from './features.js';

/**
 * A learned opinion about whether a moment is worth suggesting, if one exists.
 *
 * The rule that ships is hand-made, and its one real threshold was set by
 * looking at ten clips. That is defensible and it is not the same as knowing
 * what *you* would have kept. Every trim now records where a person actually
 * cut (see `HighlightLabel`), and `scripts/train-highlights.mjs` fits a
 * logistic regression to those labels and writes the weights here.
 *
 * Deliberately a linear model on a handful of named features: it fits on a few
 * hundred examples rather than a few hundred thousand, it is a file you can
 * read, and a bad one is obvious rather than mysterious. Nothing is downloaded
 * and nothing is sent anywhere.
 *
 * With no file present the app behaves exactly as it did before.
 */

export interface HighlightModel {
  version: number;
  /** Must match FEATURE_NAMES, or the weights mean something else. */
  features: string[];
  weights: number[];
  bias: number;
  /** Above this the moment is worth suggesting. */
  threshold: number;
  trainedAt?: string;
  examples?: number;
}

const FILE = 'highlight-model.json';

let cached: { at: number; mtimeMs: number; model: HighlightModel | null } | null = null;

export function modelPath(): string {
  return join(userDataDir(), FILE);
}

/**
 * Read the model, if there is one and it still matches the feature list.
 *
 * Re-read when the file changes, so dropping in a newly trained model takes
 * effect without a restart.
 */
export function loadModel(): HighlightModel | null {
  const path = modelPath();

  let mtimeMs = 0;
  try {
    if (!existsSync(path)) {
      cached = { at: Date.now(), mtimeMs: 0, model: null };
      return null;
    }
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }

  if (cached && cached.mtimeMs === mtimeMs) return cached.model;

  let model: HighlightModel | null = null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as HighlightModel;

    const sameFeatures =
      Array.isArray(parsed.features) &&
      parsed.features.length === FEATURE_NAMES.length &&
      parsed.features.every((name, i) => name === FEATURE_NAMES[i]);

    if (!sameFeatures) {
      console.warn(`[highlights] ${FILE} was trained on different features; ignoring it`);
    } else if (!Array.isArray(parsed.weights) || parsed.weights.length !== FEATURE_NAMES.length) {
      console.warn(`[highlights] ${FILE} has the wrong number of weights; ignoring it`);
    } else {
      model = parsed;
      console.log(
        `[highlights] using ${FILE}` +
          (parsed.examples ? ` (${parsed.examples} examples)` : ''),
      );
    }
  } catch (error) {
    console.warn(`[highlights] could not read ${FILE}:`, error);
  }

  cached = { at: Date.now(), mtimeMs, model };
  return model;
}

/** Probability that this moment is worth suggesting, or null with no model. */
export function score(features: HighlightFeatures): number | null {
  const model = loadModel();
  if (!model) return null;

  const x = toVector(features);
  let sum = model.bias;
  for (let i = 0; i < x.length; i++) sum += model.weights[i] * x[i];

  return 1 / (1 + Math.exp(-sum));
}

/** Forget the cached file. Tests only. */
export function forgetModel(): void {
  cached = null;
}
