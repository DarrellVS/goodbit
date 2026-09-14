/**
 * Fit a model to what you actually kept.
 *
 * The rule that ships is hand-made and its threshold was set by looking at ten
 * clips. This replaces that judgement with yours: every trim recorded by the
 * app says where a person cut a clip, every rejection says a suggestion was
 * wrong, and a logistic regression over the same features the app computes
 * turns those into weights.
 *
 *   node scripts/train-highlights.mjs --labels labels.json
 *   node scripts/train-highlights.mjs --labels labels.json --out "%APPDATA%/GoodBit/highlight-model.json"
 *
 * Export the labels from the app first (Settings → Advanced → Suggestions), or
 * read them straight out of the database:
 *
 *   sqlite3 -json "%APPDATA%/GoodBit/goodbit.db" "select * from highlight_label" > labels.json
 *
 * Deliberately a linear model on seven named features. It fits on a couple of
 * hundred examples rather than a couple of hundred thousand, the output is a
 * file you can read, and a bad one is obvious rather than mysterious. Nothing
 * leaves the machine.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/** Must match FEATURE_NAMES in src/main/services/highlights/features.ts. */
const FEATURES = [
  'peakZ',
  'spreadLu',
  'eventSec',
  'position',
  'durationSec',
  'busyness',
  'runnerUpZ',
];

/** Enough that the weights mean something rather than memorise a handful of clips. */
const MIN_EXAMPLES = 60;

/**
 * A label becomes an example of "worth suggesting" or "not".
 *
 * `accepted` — the suggestion was taken as offered: a positive.
 * `rejected` — it was shown and called wrong: a negative.
 * `trim` — someone cut somewhere else. Positive if what they kept overlaps
 *   what was suggested, negative if the suggestion pointed somewhere else
 *   entirely; a trim with no suggestion on screen tells us nothing about the
 *   decision and is skipped.
 */
function toExample(row) {
  const features = FEATURES.map((f) => Number(row[f] ?? NaN));
  if (features.some((v) => !Number.isFinite(v))) return null;

  if (row.source === 'accepted') return { features, label: 1 };
  if (row.source === 'rejected') return { features, label: 0 };

  if (row.source === 'trim') {
    if (row.suggestedStartSec === null || row.suggestedStartSec === undefined) return null;
    const overlap =
      Math.min(row.chosenEndSec, row.suggestedEndSec) -
      Math.max(row.chosenStartSec, row.suggestedStartSec);
    const chosen = row.chosenEndSec - row.chosenStartSec;
    return { features, label: chosen > 0 && overlap / chosen > 0.5 ? 1 : 0 };
  }

  return null;
}

/** Zero mean, unit variance, so one feature measured in seconds cannot dominate. */
function standardise(examples) {
  const n = FEATURES.length;
  const mean = new Array(n).fill(0);
  const sd = new Array(n).fill(0);

  for (const e of examples) for (let i = 0; i < n; i++) mean[i] += e.features[i] / examples.length;
  for (const e of examples) {
    for (let i = 0; i < n; i++) sd[i] += (e.features[i] - mean[i]) ** 2 / examples.length;
  }
  for (let i = 0; i < n; i++) sd[i] = Math.sqrt(sd[i]) || 1;

  return {
    mean,
    sd,
    rows: examples.map((e) => ({
      label: e.label,
      x: e.features.map((v, i) => (v - mean[i]) / sd[i]),
    })),
  };
}

/** Plain gradient descent with a little L2. Seven features; this is not the slow part. */
function fit(rows, { steps = 4000, rate = 0.1, l2 = 0.01 } = {}) {
  const n = FEATURES.length;
  let w = new Array(n).fill(0);
  let b = 0;

  for (let step = 0; step < steps; step++) {
    const gw = new Array(n).fill(0);
    let gb = 0;

    for (const { x, label } of rows) {
      let z = b;
      for (let i = 0; i < n; i++) z += w[i] * x[i];
      const p = 1 / (1 + Math.exp(-z));
      const err = p - label;
      for (let i = 0; i < n; i++) gw[i] += (err * x[i]) / rows.length;
      gb += err / rows.length;
    }

    for (let i = 0; i < n; i++) w[i] -= rate * (gw[i] + l2 * w[i]);
    b -= rate * gb;
  }

  return { w, b };
}

function evaluate(rows, w, b) {
  let right = 0;
  let truePos = 0;
  let falsePos = 0;
  let falseNeg = 0;

  for (const { x, label } of rows) {
    let z = b;
    for (let i = 0; i < w.length; i++) z += w[i] * x[i];
    const predicted = 1 / (1 + Math.exp(-z)) >= 0.5 ? 1 : 0;

    if (predicted === label) right++;
    if (predicted === 1 && label === 1) truePos++;
    if (predicted === 1 && label === 0) falsePos++;
    if (predicted === 0 && label === 1) falseNeg++;
  }

  return {
    accuracy: right / rows.length,
    precision: truePos + falsePos ? truePos / (truePos + falsePos) : 0,
    recall: truePos + falseNeg ? truePos / (truePos + falseNeg) : 0,
  };
}

function main() {
  const labelsPath = arg('labels', 'labels.json');
  if (!existsSync(labelsPath)) {
    console.error(`no labels at ${labelsPath}`);
    process.exit(1);
  }

  const rows = JSON.parse(readFileSync(labelsPath, 'utf-8'));
  const examples = rows.map(toExample).filter(Boolean);
  const positives = examples.filter((e) => e.label === 1).length;

  console.log(`${rows.length} labels, ${examples.length} usable (${positives} kept, ${examples.length - positives} not)`);

  if (examples.length < MIN_EXAMPLES) {
    console.error(
      `\nNot enough yet. ${MIN_EXAMPLES} is the floor and there are ${examples.length}.\n` +
        `Keep trimming clips — every trim with a suggestion on screen is one example — and run this again.`,
    );
    process.exit(1);
  }

  if (positives < 10 || examples.length - positives < 10) {
    console.error('\nToo one-sided to learn from: at least ten of each is needed.');
    process.exit(1);
  }

  // A held-out fifth, so the reported numbers are not the ones it was fitted on.
  const shuffled = [...examples].sort(() => Math.random() - 0.5);
  const cut = Math.floor(shuffled.length * 0.8);
  const { mean, sd, rows: all } = standardise(shuffled);
  const train = all.slice(0, cut);
  const test = all.slice(cut);

  const { w, b } = fit(train);
  const onTrain = evaluate(train, w, b);
  const onTest = evaluate(test, w, b);

  console.log(
    `\ntrained on ${train.length}, held out ${test.length}\n` +
      `  accuracy  ${(onTrain.accuracy * 100).toFixed(0)}% train, ${(onTest.accuracy * 100).toFixed(0)}% held out\n` +
      `  precision ${(onTest.precision * 100).toFixed(0)}%   recall ${(onTest.recall * 100).toFixed(0)}%`,
  );

  console.log('\nwhat it learned:');
  FEATURES.map((name, i) => ({ name, weight: w[i] }))
    .sort((a, b2) => Math.abs(b2.weight) - Math.abs(a.weight))
    .forEach(({ name, weight }) =>
      console.log(`  ${name.padEnd(12)} ${weight >= 0 ? '+' : ''}${weight.toFixed(3)}`),
    );

  // The app scores raw features, so the standardisation is folded into the
  // weights rather than shipped alongside them.
  const weights = w.map((v, i) => v / sd[i]);
  const bias = b - w.reduce((acc, v, i) => acc + (v * mean[i]) / sd[i], 0);

  const model = {
    version: 1,
    features: FEATURES,
    weights,
    bias,
    threshold: 0.5,
    trainedAt: new Date().toISOString(),
    examples: examples.length,
  };

  const out = arg('out', join(process.cwd(), 'highlight-model.json'));
  writeFileSync(out, JSON.stringify(model, null, 2), 'utf-8');
  console.log(`\n${out}`);
  console.log('Drop that into %APPDATA%/GoodBit/ and the app uses it on the next suggestion.');
}

main();
