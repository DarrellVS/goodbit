import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Enough of `electron` for the pure logic to import.
 *
 * `settings.ts` opens with `import { app } from 'electron'`, and outside a
 * running Electron process that import has nothing to resolve. Anything in
 * `src/main` that wants to know where the user's data directory is therefore
 * reaches this rather than the real module, and gets a fresh empty temp
 * directory: a test that wants a file found there has to write it on purpose,
 * which is the point.
 *
 * **It used to be a symptom as well as a stub.** `decide.ts` was documented as
 * costing nothing and touching nothing, and then reached `electron`
 * transitively, because `model.ts` asked `settings.ts` for `userDataDir()` to
 * look for a trained model. So the most consequential pure function in the app
 * could not be exercised without a filesystem, and the model branch of it could
 * not really be exercised at all. 2.1 inverted that: `decide()` takes a
 * `score` function as an argument, `EnsureClipSuggestionsAction` passes the
 * real one, and `decide.spec.ts` passes a one line fake. What is left here is a
 * plain test double rather than a workaround, and nothing that imports it is
 * pretending to be pure.
 */
const userData = mkdtempSync(join(tmpdir(), 'goodbit-unit-'));

export const app = {
  getPath(name: string): string {
    if (name === 'userData') return userData;
    return userData;
  },
  getName: () => 'GoodBit',
  getVersion: () => '0.0.0-test',
};

export default { app };
